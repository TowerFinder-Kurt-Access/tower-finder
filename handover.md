# Handover — Email OTP (2FA) + Email Magic Link

> **Status:** Planned — NOT implemented. This file is the implementation handover, written
> on branch `feat/auth-credentials` (PR #1) after the login-security round shipped
> (password policy, lockout, 7-day sessions, instant revocation, 180-day rotation dialog,
> audit trail). Read it end-to-end before starting; it replaces the PDF's
> authenticator-app 2FA idea (no QR, no TOTP library, no recovery codes).

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

### Phase A — Email infra (≈1 h)
1. Create Resend account, verify domain (TXT records), copy API key.
2. `src/lib/email.ts` — single wrapper:
   ```ts
   export async function sendEmail(to: string, subject: string, html: string): Promise<void>
   ```
   Uses `fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` }, body: { from: 'Tower Finder <no-reply@yourdomain>', to, subject, html } })`.
   Throw on non-2xx; log via existing patterns (no new logging framework).
3. Env: `RESEND_API_KEY` in `.env` + Vercel. Never commit it.

### Phase B — Email OTP as the second factor (≈8–10 h)
**Data:** extend Prisma — new model (preferred; do NOT pollute `User`):
```prisma
model LoginOtp {
  id        Int      @id @default(autoincrement())
  email     String   @unique
  otpHash   String   // sha256(otp) — never store plaintext
  expiresAt DateTime
  attempts  Int      @default(0)
  createdAt DateTime @default(now())
}
```
Also extend `LoginEventType` with `OTP_SENT`, `OTP_VERIFIED`, `OTP_FAILED`.
One migration: `npx prisma migrate dev --name login_otp` (model + enum; no other schema
changes).

**Flow (two-step, stateless):**
1. User submits email+password (+ OTP field empty). Inside the existing `authorize()`:
   - run current password/lockout checks as-is (reuse `getLockoutRemainingSeconds`),
   - if password OK: generate 6-digit OTP, store `sha256` + 10-min TTL, upsert
     `LoginOtp`, send email, return a marker error like `"OTP_REQUIRED"` (KEEP the user's
     email in the login form; never confirm account existence across step boundaries —
     return the same step marker whether or not the account exists).
   - Cooldown: refuse re-send within 60 s (needs `sentAt`/`createdAt` check) — prevents
     mail-bombing; count abuse toward the same lockout window (reuse
     `recordLoginEvent` + lockout helpers so OTP brute-force shares the 15-min window).
2. Login page transitions to an OTP step (same page, second form mode, countdown,
   "Resend code" button honoring the 60 s cooldown).
3. User submits code: second `signIn('credentials', { email, password, otp })`;
   `authorize()` sees `otp`:
   - verify `LoginOtp`: exists, unexpired, `attempts < 3` (increment on each fail;
     at 3 → delete row + record `OTP_FAILED` + treat as failed attempt in the lockout
     coordinator),
   - constant-time compare (`crypto.timingSafeEqual` on digests),
   - success → delete row, `recordLoginEvent(LOGIN_SUCCESS)` (also set `lastLogin`),
     proceed to the normal JWT mint (mustChangePassword logic untouched).
4. Edge cases to cover: OTP reuse (deleted on first success), expiry mid-flow, email
   changed between steps, user deleted/locked between steps, concurrent tabs (one OTP
   per email — last-write-wins), Resend failure (surface "couldn't send code — try
   again", do NOT write OTP), lockout during OTP stage counts once per login attempt.

**Reuse map (copy, don't reinvent):** lockout math + `getLockoutRemainingSeconds`,
`recordLoginEvent`, Snackbar surface, `PasswordField`, `/api/auth/*` middleware
allow-tree (OTP send/verify endpoints live under `/api/auth/` so they pass through).

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

### Phase D — Verification checklist (≈2–3 h)
- `npm run build` green; no new `any`/suppressions; Airbnb/TS strict patterns.
- Curl-level: OTP send (check DB row + Resend dashboard), 3 failed codes → row
  deleted + lockout engaged (`/api/auth/lockout-status` reflects it), correct code →
  session cookie set, OTP reuse after success → rejected.
- Browser-level: password+OTP happy path; wrong code → inline error; "Resend" honors
  cooldown; OTP step survives page reload (re-prompt, don't resend); lockout countdown
  visible in OTP step; magic link lands on `/` signed in; inactive user rejected.
- Regression: password policy, 180-day dialog (flip `PASSWORD_MAX_AGE_MS` to `60_000`
  as documented in code), revocation flow still pass.
- Clean up any test rows (`node -e` with Prisma: delete `LoginOtp`/`LoginEvent` for
  smoke emails).

**Estimates:** Phase A 1 h + B 8–10 h + C 4–6 h + D 2–3 h ≈ **15–20 h total**
(OTP-only sub-path ≈ 12–15 h). Replaces the 31 h TOTP row.

---

## 4. Open product decisions (ask before/while implementing)

1. Keep authenticator TOTP as a future option, or drop the 2FA row entirely once OTP ships?
2. OTP TTL (recommend 10 min) / attempts (3) / resend cooldown (60 s) — confirm.
3. Magic link: additional login method next to password, or also usable as the
   password-recovery channel? (It naturally doubles as "forgot password".)
4. Should magic link skip the OTP second step? (Recommendation: yes.)
5. Auto-purge `LoginOtp` rows (e.g. delete expired rows on each send — cheap `deleteMany`
   where `expiresAt < now`).

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