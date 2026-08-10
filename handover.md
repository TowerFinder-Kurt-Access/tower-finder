# Handover — Email OTP (2FA) + Email Magic Link

> **Status:** Email OTP **implemented & verified** on branch `feat/auth-credentials` (PR #1):
> `LoginOtp` schema + migration `20260811031542_login_otp`, `src/lib/email.ts` (Resend
> wrapper + console fallback), `src/lib/otp.ts` (issue/verify, constant-time, 5-min TTL,
> 3 attempts, 60s resend cooldown), two-step `authorize()` in `src/lib/auth.ts` (custom
> `CredentialsSignin` codes: `otp_required / otp_cooldown / otp_send_failed /
> otp_invalid / otp_expired / otp_max_attempts`, failures feed the lockout window), and
> the OTP step UI in `src/app/login/page.tsx` (6-digit field, resend countdown, Back).
> **Magic link is still planned** — Phase C below is the active spec. **TOTP is kept for
> future reference only** (no QR, no secret storage). Browser-verified end-to-end:
> happy path, wrong ×3 + 4th rejected, reuse blocked (row deleted), lockout interplay,
> cooldown + resend, send-failure surface. Read Phase C before starting the magic link.

---

## 1. Decision summary

| | Authenticator TOTP (rejected) | Email OTP (chosen) | Magic link (chosen, additive) |
|---|---|---|---|
| Requirement | PDF "second factor" | Same requirement, different channel | Optional extra login method |
| New deps | `otplib`/`speakeasy` + `qrcode` + secret encryption key | One email service only (Resend) | Same email service (Resend) |
| Cost | free libs, but secret storage + crypto | **$0** — Resend free tier: 3,000 emails/mo, 100/day, one domain | same |
| Est. effort | 31 h | **~12–15 h** | **+4–6 h** |

Delivery service: **Resend** (free tier, no credit card). Setup = create account +
verify one custom domain (add SPF/DKIM TXT record at DNS host) + put `RESEND_API_KEY`
in `.env` locally and in Vercel env. Free cap of 100/day is fine for login traffic.

---

## 2. Ground truth — what exists today (verified Aug 2026)

- **Next.js App Router + Auth.js v5 beta (next-auth 5.0.0-beta.32, JWT sessions, NO DB adapter).**
- `src/lib/auth.config.ts` — `credentials` provider + custom `jwt()` callback:
  - sets `token.mustChangePassword = passwordIsExpired(passwordChangedAt)` at sign-in
    (**baked into the JWT — re-login required to re-evaluate**),
  - `session: { strategy: 'jwt', maxAge: 604800 }` (7 days, sliding).
- `src/lib/security-policy.ts` — `PASSWORD_MAX_AGE_DAYS = 180`, `PASSWORD_MAX_AGE_MS`
  (set to `60_000` only for demoing the rotation dialog), `passwordIsExpired()`.
- `src/lib/login-security.ts` — `recordLoginEvent(email, userId?, type, ip, userAgent)`
  → Postgres `LoginEvent`; lockout: `MAX_FAILED_ATTEMPTS = 5`, `LOCKOUT_WINDOW_MS = 15min`,
  sliding-window `getLockoutRemainingSeconds(email)`; `GET /api/auth/lockout-status?email=`
  already exists behind the middleware allow-tree.
- Middleware (`src/middleware.ts`): `/api/auth/*` passes through; session-version
  revocation check via `GET /api/auth/session-version` (401 → login redirect/API 401);
  logged-in users at `/login` bounce home; anonymous → `/login`.
- `src/components/PasswordChangeReminder.tsx` — MUI dialog (snooze 24h via
  `localStorage['password-reminder-snoozed-at']`); mounted in `src/app/layout.tsx`.
- `src/components/PasswordField.tsx` — MUI v7 `slotProps` eye-toggle input (use for new
  OTP inputs too).
- Login page `src/app/login/page.tsx` — top-center Snackbar error surface (auto-hide 6s,
  lockout messages stay open), card alert removed.
- Prisma `User`: `email @unique`, `password`, `isActive`, `passwordChangedAt`,
  `sessionVersion`, `lastLogin`, **`emailVerified DateTime?` (currently unused — magic
  link can set it, mirroring Supabase semantics)**.
- `LoginEventType` enum (6 values): `LOGIN_SUCCESS LOGIN_FAILED LOGIN_LOCKED
  PASSWORD_CHANGED PASSWORD_RESET ACCOUNT_DEACTIVATED`.
- Installed next-auth beta **ships the `email` provider** (`node_modules/next-auth/providers/email.js`)
  + `nodemailer` transport option; custom `sendVerificationRequest` can use plain `fetch`
  to Resend (no nodemailer install needed).
- No `psql` on this machine — DB checks via `node -e` with `@prisma/client` + `dotenv`.
- `.env` must NOT pin `NEXTAUTH_URL` (production URL lives in Vercel env `AUTH_URL`).

---

## 3. Implementation plan

### Phase A — Email infra (≈1 h) — ✅ DONE
1. ~~Create Resend account, verify domain (TXT records), copy API key~~ — key is in `.env`; **domain `towerfinder.com` still unverified in the Resend dashboard** (403 until SPF/DKIM TXT added).
2. `src/lib/email.ts` — shipped as specced, plus: non-prod always logs the message (`[dev-email]` — OTP readable from the server log), and in dev a Resend 4xx logs a warning and falls back to the console path instead of failing the flow. Production throws (`otp_send_failed`).
3. Env: `RESEND_API_KEY` in `.env` (real) + `.env.example` (placeholder) + Vercel env for prod. Never commit the real key.

### Phase B — Email OTP as the second factor (≈8–10 h) — ✅ DONE
Implemented as specced below (schema, migration, flow, edge cases verified). Notes on deltas:
- **OTP is now opt-in per user** (`User.twoFactorEnabled`, default `false` — nobody is forced into the code step): toggle on the profile page (`/api/profile/two-factor` — enable sends a code that must be verified first, disable is immediate). `authorize()` skips the OTP step unless the flag is set.
- `LoginEventType` now has 9 values: `LOGIN_SUCCESS LOGIN_FAILED LOGIN_LOCKED PASSWORD_CHANGED PASSWORD_RESET ACCOUNT_DEACTIVATED OTP_SENT OTP_VERIFIED OTP_FAILED`.
- Error contract (login page reads `result.code`): `otp_required`, `otp_cooldown`, `otp_send_failed`, `otp_invalid`, `otp_expired`, `otp_max_attempts` — plus the existing `account_locked`.
- **Max-attempts semantics**: attempts increment per wrong code; verify is allowed while `attempts < 3`, so the 3rd wrong shows "Incorrect code", the 4th submit trips `otp_max_attempts` (row deleted).
- OTP issuance order: cooldown check → upsert row → send email → throw `otp_required` (dev fallback keeps the flow testable while the domain is unverified).
- Migration applied to the live DB via `npx prisma db execute` (hosted Postgres has no shadow DB for `migrate dev`); migration folder `prisma/migrations/20260811031542_login_otp/` is committed.

### Phase C — Magic link (≈4–6 h, independent of Phase B)
1. Add `EmailProvider` from `next-auth/providers/email` to `authConfig.providers`
   (JWT strategy — no adapter needed; verified provider ships in beta.32).
2. Custom `sendVerificationRequest` → `sendEmail()` (Resend) with a branded
   "Sign in to Tower Finder" template; token lifecycle handled by Auth.js (single-use,
   expires — default 24 h; set provider option `maxAge: 60 * 15` for 15 min; verified in
   `@auth/core/providers/email.d.ts`).
3. Login page: secondary "Sign in with email link" button → email capture form →
   "Check your inbox" state (reuse Snackbar/dialog feel).
4. On first successful link sign-in set `emailVerified = new Date()` (Supabase-style
   account confirmation); enforce `signInCallback` to reject inactive users
   (`!isActive` → redirect `/login?error=...`).
5. Guard: link signs in the account owning that email — do NOT create accounts
   implicitly (keep admin-created users only) unless product decides otherwise;
   if implicit creation is wanted, do it explicitly + audit `LOGIN_SUCCESS`.
6. Combine with OTP: link may skip the OTP step for same-device convenience or not —
   product decision; default recommendation: magic link = full login (no extra OTP),
   OTP = the 2FA step for password flow.

### Phase D — Verification checklist (≈2–3 h) — mostly ✅ for OTP; regression + magic-link items pending
- `npm run build` green; no new `any`/suppressions; Airbnb/TS strict patterns — ✅.
- Curl-level: OTP send (check DB row + Resend dashboard), 3 failed codes → row
  deleted + lockout engaged (`/api/auth/lockout-status` reflects it), correct code →
  session cookie set, OTP reuse after success → rejected — ✅ (browser-verified;
  Resend dashboard delivery check pending domain verification).
- Browser-level: password+OTP happy path; wrong code → inline error; "Resend" honors
  cooldown; OTP step survives page reload (re-prompt, don't resend); lockout countdown
  visible in OTP step; magic link lands on `/` signed in; inactive user rejected —
  first five ✅, magic-link items pending.
- Regression: password policy, 180-day dialog (flip `PASSWORD_MAX_AGE_MS` to `60_000`
  as documented in code), revocation flow still pass — **pending; run before merging**.
- Clean up any test rows (`node -e` with Prisma: delete `LoginOtp`/`LoginEvent` for
  smoke emails) — **pending for the test account** (locked at the time of writing).

**Estimates:** Phase A 1 h + B 8–10 h + C 4–6 h + D 2–3 h ≈ **15–20 h total**
(OTP-only sub-path ≈ 12–15 h). Replaces the 31 h TOTP row.

---

## 4. Open product decisions (ask before/while implementing)

1. ~~Keep authenticator TOTP as a future option, or drop the 2FA row entirely once OTP ships?~~ — **Resolved: TOTP kept for future reference, not planned** (documented in PR #1 + issue #2).
2. ~~OTP TTL / attempts / cooldown~~ — **Confirmed during implementation: 5 min / 3 attempts (4th submit trips max) / 60 s cooldown.**
3. Magic link: additional login method next to password, or also usable as the password-recovery channel? (It naturally doubles as "forgot password".) — **Open.**
4. Should magic link skip the OTP second step? (Recommendation: yes.) — **Open.**
5. Auto-purge `LoginOtp` rows (e.g. delete expired rows on each send — cheap `deleteMany` where `expiresAt < now`). — **Open** (rows are deleted on success/expiry/max-attempts; long-expired leftovers are cleaned by the next issue for the same email).

---

## 5. REUSED gotchas (from the shipped round — do not re-learn them)

- `mustChangePassword` is minted into the JWT at sign-in; a mid-session constant change
  never re-evaluates. Always re-login after policy changes.
- Never hard-kill `next dev` or delete `.next/dev/lock`; if cache misbehaves,
  `rm -rf .next` and restart. Dev port: 3000 (stale process may squat it — kill + restart).
- After any `gh pr edit`, verify with `gh pr view 1 --json body --jq .body` — remote
  views can lag behind writes.
- Lockout is per-email with a sliding window over LOGIN_FAILED rows — backdate/delete
  `LOGIN_FAILED` rows for an email to unlock instantly during tests.
- Never put `NEXTAUTH_URL` (or any prod URL) back into `.env`; local URLs derive from
  the request.
- One module per commit (conventional commits); no force-push; build must pass before
  marking done — same rules as AGENTS.md.