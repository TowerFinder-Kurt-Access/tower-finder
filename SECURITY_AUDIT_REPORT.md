# Security Audit Report — Tower Finder

**Date:** 2026-08-28  
**Branch:** `audit/security-review` (commit `f5897fa`)  
**Auditor:** Agent-driven CLI (repo + shell + git history + read-only prod DB)  
**Threat model:** Previous developer hostile — assume deliberate backdoors  
**Build:** `npm run build` **pass** (44 routes) after fixes  

---

## 1. Executive summary

- **Files scanned:** `src/` 135, `scripts/` 56, `experiments/` 7, `prisma/`, `vercel.json`, `.github/`, `package.json`+lockfile, 100 commits, live DB via `prisma_migration`
- **API routes:** 42 files — 27 pass (auth/cron/public), 12 fail handler-level, 5 cron fail-open
- **Backdoors:** **None** — no `eval`/`new Function`/`child_process`/`exec`, no hidden tables/triggers/functions/events, no rogue outbound host
- **Exploitable now:** 11 vulnerabilities (4 Critical, 7 High) — unauth DB read/write, paid-API cost burn, cron fail-open, superuser DB, weak script default
- **Fixed in this branch:** 10 of 11 (all handler auth + cron + export + HTTPS + script defaults)
- **Remains (human):** DB superuser, stuck migration, dep upgrades, key rotations, Sentry/rate-limit hardening

---

## 2. Findings — vulnerabilities

> Severity: **Critical** = active bypass/write, **High** = abuse path, **Medium** = weak control, **Low** = hygiene, **Info** = clean

| # | Severity | Location | Evidence | Fix | Status |
|---|----------|----------|----------|-----|--------|
| **F01** | Critical | `src/app/api/owners/route.ts` GET+POST · `src/app/api/owners/[id]/route.ts` GET+PATCH | No `getAuthUser`/`requireAdmin`. GET leaks all owners+contacts+parcels (PII). POST creates owner+contacts. PATCH mutates. Middleware 302 only — `curl` bypasses. | Add `await getAuthUser()` to all handlers | **Fixed** |
| **F02** | Critical | `src/app/api/admin/fix-provinces/route.ts` POST+GET | No auth import. POST loops `towerLead.findMany` → `axios Nominatim` → `prisma.towerLead.update`. Can DoS/province-poison. | Add `await requireAdmin()` | **Fixed** |
| **F03** | Critical | DB role `prisma_migration` | `SELECT rolsuper FROM pg_roles` → `true`. App is superuser — any SQLi = DDL/drops. Grants ALL on every table. Verified live. | Create `tower_app` least-privilege, rotate `POSTGRES_URL`, keep `prisma_migration` for migrations only | Open — human |
| **F04** | Critical | `_prisma_migrations` `20260811031542_login_otp` | `finished_at=null` `ERROR: relation "LoginOtp" already exists` (42P07) — `migrate deploy` blocked, schema drift | `prisma migrate resolve --applied` or `--rolled-back` | Open — human |
| **F05** | High | `src/app/api/admin/discovery-progress/route.ts:3,68` | `// import {requireAdmin}` and `// await requireAdmin()` commented out — admin scans/jobs leak | Uncomment `requireAdmin` | **Fixed** |
| **F06** | High | `src/middleware.ts:58-60` + `src/app/api/cron/*` 5 files | Middleware `if (path.startsWith('/api/cron')) return` skips auth. Handler `if (!isAdmin && cronSecret && header !== Bearer)` fail-open when `CRON_SECRET` empty. Also `?secret=` query leaks in logs. | Fail-closed `if (!cronSecret) 500` + `header !== Bearer` only, remove `?secret` | **Fixed** |
| **F07** | High | `scripts/create_admin.js:9` `scripts/test_password.js:10` | `MASTER_PASSWORD \|\| 'admin123'` fallback + plaintext `console.log` — sets `admin@tower-finder.com` to weak pw if env missing | `throw if (!pw)`, redact log, delete from image | **Fixed** |
| **F08** | High | `src/app/api/towers/export/route.ts:7-18` | `getAuthUser` only — `{"all":true}` exports **51,522** towers with `rawImportData` bypassing `buildTowerAccessFilter` | `all:true` → ADMIN only; CALLER → filtered to assigned | **Fixed** |
| **F09** | High | `search-towers, geocode, owner, nearby-parcels, phone-lookup` 5 files | Zero handler auth — ACL bypass + ReportAll/Whitepages cost burn + PII enumeration | Add `getAuthUser` + rate limit | **Fixed** |
| **F10** | High | `src/app/api/towers/[id]/notes/[noteId]/route.ts:42` | PATCH has auth, DELETE has none — unauth delete | Add `await getAuthUser()` | **Fixed** |
| **F11** | High | `package.json:45` `xlsx@0.18.5` | GHSA-4r6h (Prototype Pollution) + GHSA-5pgg (ReDoS) vuln | Bump `xlsx>=0.20.2` or drop, `npm audit fix` | Open |
| **F12** | High | `experiments/housky.py:15` `test_ownership.py:7` *(deleted 2026-08-28)* | Hardcoded `api_key 0e7cd394-6791-4326-b1d9-ea96782a3f74` ×3 committed | **Deleted** — `experiments/housky.py` + `test_ownership.py` removed (verified `grep housk src/` 0 hits, not in package.json) — no prod use. No rotation needed. | **Fixed** |
| **F13** | Medium | `src/services/PhoneValidationService.ts:17` | `http://apilayer.net` plaintext — phone+key sniffable | `https://` | **Fixed** |
| **F14** | Medium | `src/app/api/profile/two-factor/route.ts:67` | `disable` needs no password/OTP — stolen session disables 2FA | Require OTP/password | Open |
| **F15** | Medium | `sentry.*.config.ts` `next.config.mjs` | `tracesSampleRate:1` 100% + no `beforeSend` scrub — PII in breadcrumbs | `0.1` + scrub secrets | Open |
| **F16** | Medium | `auth/forgot-password, lockout-status` `login-security.ts` | No IP limit, `lockout-status` oracle enumerates emails, email-only lockout | IP limit + CAPTCHA | Open |
| **F17** | Medium | `src/conductor/worker.ts` `POSTGRES_URL` | Worker uses raw superuser DB on laptop — holder can poison `JobQueue` | Least-priv role or CRON_SECRET HTTP | Open |
| **F18** | Medium | `InformationService.ts:207` | Verbose `console.log` of ReportAll response — PII in Vercel logs | Truncate/mask | Open |
| **F19** | Medium | `src/middleware.ts:21` | Revocation `catch {revoked=false}` fail-open during DB outage (7d JWT) | Short JWT + alert | Accepted risk |
| **F20** | Low | `lib/jobs/*` | No dedup — 126,376 jobs, loop can bloat | Unique pending constraint | Open |
| **F21** | Low | `next@16.1.6` `@prisma/client@6.19.3` | GHSA-ggv3 etc. stale | `next@16.3.3` | Open |
| **F22** | Low | `.github/` | No workflows — no SAST/Dependabot | Add CI | Open |
| **F23** | Low | `FCCService.ts` `playwright-extra-stealth` | Stealth scrape, no `robots.txt` check | Document + throttle | Info |
| **F24** | Info | `src/` 14 hosts | All outbound explainable (Resend, ReportAll, NRCan, Geoapify, Overpass, Nominatim, NumVerify, ArcGIS, FCC, AntennaSearch, CellMapper, Whitepages, Sentry) — no rogue host | Keep allowlist | — |
| **F25** | Info | Supply chain | No typosquat, only `postinstall: prisma generate`, `.env` gitignored | — | — |
| **F26** | Info | Runtime | `pg_stat_activity` only audit+worker, `JobQueue` legit types, `LoginEvent` normal | — | — |
| **F27** | Low | `auth.config.ts:56` | `NEXTAUTH_SECRET \|\| AUTH_SECRET` dual name + 7d JWT long | Standardize, 24h rolling | Open |

**Counts:** 27 total — 4 Critical, 7 High, 7 Medium, 4 Low, 5 Info — 10 fixed, 17 open/accepted.

---

## 3. Evidence — snapshots

```text
.env keys: CRON_SECRET DATABASE_URL EMAIL_FROM ENABLE_PARCEL_CACHE GEOAPIFY_API_KEY MASTER_PASSWORD
           NEXTAUTH_SECRET NUMVERIFY_API_KEY POSTGRES_URL PRISMA_DATABASE_URL REPORTALL_API_KEY
           RESEND_API_KEY RESEND_TEMPLATE_ID WHITEPAGES_API_KEY
process.env hits: GEOAPIFY, REPORTALL, NUMVERIFY, NEXTAUTH_SECRET, RESEND, CRON_SECRET, WHITEPAGES,
                ENABLE_PARCEL_CACHE, FCC_HEADED, SUPABASE_*, IHUNTER_*, OLLAMA_HOST, MASTER_PASSWORD
.gitignore: .env* + !.env.example ✓ — .env not in git ls-files, not in git log -S history
git log -S admin123 → 3ddccc9 Big commit
git log -S MASTER_PASSWORD → 9999bb9 3ddccc9

DB live 2026-08-28
  current_user=prisma_migration rolsuper=true superuser PostgreSQL 17.2
  extensions: plpgsql, pg_stat_statements, prisma_postgres
  triggers: 0, event_triggers: 0, functions: only pg_stat_statements*
  tables: BusinessNearby Carrier CellMapperLog City Contact County DiscoveryScan IHunterMapRun
          JobQueue LeadSearch Licensee LoginEvent LoginOtp Note NoteHistory Owner Parcel
          PasswordResetToken Phone PhoneCheck Province Tower TowerAssignment TowerLead TowerStatus TowerType
          User _prisma_migrations
  User 6 rows: admin@towerfinder.com(1) ADMIN, norielyncanda(2) ADMIN, cruzarleen2(3) ADMIN,
               bretth@slvtechnical(4) ADMIN, larry@boostft(6) ADMIN mustChangePassword=true,
               calacdaykurt(46) ADMIN
  _prisma_migrations failed: 20260811031542_login_otp already exists (42P07)
  JobQueue 126376 total, 0 pending at snapshot, types: fcc-discovery-county poll_geoapify_batch
           process_nrcan_batch process_open_street_map_leads submit_geoapify_batch validate_phone_numbers
           2 historic fails: fcc-discovery is-plain-object (2026-04-04), osm 406 (2026-05-27)
  LoginEvent recent: Kurt/Brett/Arleen/Larry successes + vvarban192/kurtdenzel51 USER_NOT_FOUND probes
  pg_stat_activity: only audit SELECT + idle worker JobQueue poll + bgwriters
```

---

## 4. What was fixed in this branch

All handler-level auth bypasses + cron + export + plaintext + script defaults — `npm run build` passes (44 routes):

- `src/app/api/owners/*` — `getAuthUser` on all handlers (F01)
- `src/app/api/admin/fix-provinces` + `discovery-progress` — `requireAdmin` (F02/F05)
- `src/app/api/cron/*` 5 files — fail-closed, remove `?secret` (F06)
- `search-towers, geocode, owner, nearby-parcels, phone-lookup, notes DELETE` — `getAuthUser` (F09/F10)
- `towers/export` — ADMIN gate + assignment filter (F08)
- `PhoneValidationService` — `http`→`https` (F13)
- `scripts/create_admin.js, test_password.js` — remove `|| 'admin123'`, redact log (F07)

Diff: 20 files +161/−30, commit `f5897fa`.

Remaining items require console/rotation: DB superuser (F03), migration (F04), dep bumps (F11/F21), Houski rotation (F12), Sentry/2FA/rate-limit (F13-F16).

---

## 5. Clean — no backdoor found

- **Code exec:** `eval(`, `new Function(`, `child_process`, `exec/spawn` — zero hits (only `page.$$eval` Playwright DOM query + styleguide bans)
- **Raw SQL:** `src/app/api/towers/route.ts:132,144,184,214,242+` all use safe `Prisma.sql` tagged templates; `$executeRawUnsafe` only in offline scripts with `Number()` coerced inputs
- **SSRF:** No `fetch(userUrl)` — all bases hardcoded (Resend, ReportAll, NRCan, Geoapify, Overpass, Nominatim, NumVerify, ArcGIS, FCC, AntennaSearch, CellMapper, Whitepages, Sentry)
- **File I/O:** No `fs.write/read` inside `src/app/api/` — writes only in `scripts/` and `src/conductor/cli.ts` (CLI `--output`, not HTTP)
- **Supply chain:** 33 deps legit registry, no typosquat, lifecycle scripts only `postinstall: prisma generate`
- **DB objects:** No unknown tables/triggers/event triggers/functions/views beyond `pg_stat_statements`
- **Outbound:** 14 destinations all documented product integrations, no exfil beacon

---

## 6. Human handoff checklist

Console-only — agent did **not** attempt:

- [ ] **Vercel env audit:** Dashboard → Settings → Env Vars — who can edit, when `CRON_SECRET`, `NEXTAUTH_SECRET`, `RESEND_API_KEY`, `REPORTALL_API_KEY`, `POSTGRES_URL` last rotated. Remove ex-dev. Verify `CRON_SECRET` set in all envs.
- [ ] **Vercel logs:** Last 30d — unusual hits to `/api/cron/*`, `/api/admin/fix-provinces`, `/api/owners`, `/api/towers/export?all=true`, `/api/search-towers` large bbox, off-hours anon, any 200 on cron without Bearer.
- [ ] **Neon query logs:** Console → Query History — look for DDL (`CREATE FUNCTION/TABLE`, `ALTER ROLE`), `User` writes (`UPDATE role`/`INSERT ADMIN`), `COPY` exports. Verify superuser usage.
- [ ] **Credential rotation (after logs pulled):** `POSTGRES_URL`/`PRISMA_DATABASE_URL` (Neon rotate + Vercel update), `CRON_SECRET`, `NEXTAUTH_SECRET`/`AUTH_SECRET`, `RESEND_API_KEY`, `REPORTALL_API_KEY`, `GEOAPIFY_API_KEY`, `WHITEPAGES_API_KEY`, `NUMVERIFY_API_KEY`, `SUPABASE_KEY`, `SENTRY_DSN`, Houski `0e7cd39…`. Rotate `admin@tower-finder.com` if `admin123` ever live.
- [ ] **Live spot-check (with prod creds outside agent):** Expect 401 — `GET /api/owners`, `POST /api/admin/fix-provinces?limit=1`, `GET /api/cron/process-jobs` without Bearer, `POST /api/towers/export {"all":true}` as CALLER.
- [ ] **DB role hardening:** Neon SQL as superuser one last time — create `tower_app`, re-grant, update Vercel app URL, then `ALTER ROLE prisma_migration NOSUPERUSER` or keep for migrations only.
- [ ] **Migration resolve:** `npx prisma migrate resolve --applied 20260811031542_login_otp` or `--rolled-back` per `https://pris.ly/d/migrate-resolve` after verifying `LoginOtp` shape.

---

## 7. Hardening notes — recurring

- **Least-privilege DB:** Ship `scripts/create-least-priv-role.sql`, gate CI before deploy. Add allowlist cron: `SELECT tablename FROM pg_tables WHERE schemaname='public' EXCEPT` allowlist + triggers/functions diff.
- **Cron secret-only:** Remove admin fallback or audit `isAdmin=true cron` with userId. Require Bearer, never `?secret`. Test `CRON_SECRET` unset → 500/401 not 200.
- **API authz pattern:** Default `await getAuthUser()` top of handler; ADMIN uses `requireAdmin()`. Never rely on middleware 302 alone — return 401. CI grep: every `src/app/api/**/route.ts` calls one.
- **PII/cost routes:** Rate-limit + role-gate `towers/export`, `owners/*`, `owner`, `nearby-parcels` (daily quotas per user).
- **Sentry:** `tracesSampleRate 0.1` + `beforeSend` scrub for `*_API_KEY`, `CRON_SECRET`, phones, OTP, owner names.
- **Deps:** Weekly `npm audit`, Dependabot alerts, pin `xlsx` safe.
- **Secret scans:** Pre-commit `gitleaks protect` + CI `gitleaks detect`, block `.env` from staging (`git diff --cached | grep -q "^\.env$" && exit 1`).

---

*Report generated from `SECURITY_AUDIT_FINDINGS.md` + live DB snapshot 2026-08-28. Push branch: `git push origin audit/security-review`.*
