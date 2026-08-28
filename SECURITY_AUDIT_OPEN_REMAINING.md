# Security Audit — Open Remaining (Post-PR #9)

**Branch:** `audit/security-review` — PR #9  
**Date:** 2026-08-28  
**Source:** `SECURITY_AUDIT_REPORT.md` + `SECURITY_AUDIT_FINDINGS.md` (27 findings)  
**Legend:** ✅ Fixed in PR #9 · ⏳ Open — Human (console/rotation, not code) · ❌ Open — Code (needs code change) · ◐ Accepted risk (documented) · ℹ️ Info (no fix)

> **Progress:** 18/27 fixed (67%), 9 remaining (3 actionable: 0 code + 3 human + 3 accepted + 3 info). This file tracks only the **remaining** items. For full ledger with evidence, see `SECURITY_AUDIT_FINDINGS.md`.

---

## 1. Open — Critical (human, do after logs pulled)

| # | Status | Severity | Location | What is left | Fix | Owner |
|---|--------|----------|----------|--------------|-----|-------|
| F03 | ⏳ | Critical | `prisma_migration` DB role `rolsuper=true` | App connects as superuser — any future SQLi = DDL/drops | Create `tower_app` least-privilege (DML only on `Tower`/`Parcel`/`JobQueue` etc.), update Vercel `POSTGRES_URL`, keep `prisma_migration` for migrations only, then `ALTER ROLE prisma_migration NOSUPERUSER`. Rotate `PRISMA_DATABASE_URL` | Infra / DB — Neon console + Vercel env |
| F04 | ⏳ | Critical | `_prisma_migrations` `20260811031542_login_otp` | `finished_at=null` `ERROR: relation "LoginOtp" already exists` — `migrate deploy` blocked, schema drift | Verify `LoginOtp` shape vs migration SQL, then `npx prisma migrate resolve --applied 20260811031542_login_otp` or `--rolled-back` per `https://pris.ly/d/migrate-resolve`. Add migration-state check to CI | DB — Neon SQL + CI |

---

## 2. Open — High (code or rotation)

| # | Status | Severity | Location | What is left | Fix | Owner |
|---|--------|----------|----------|--------------|-----|-------|
| F11 | ✅ | High | `package.json` `src/services/ExportService.ts` *(fixed 2026-08-28)* | `xlsx@0.18.5` GHSA-4r6h/5pgg — **removed** (no fix available, latest still vuln) — rewrote `ExportService` to `exceljs@4.4.0` (moved to `dependencies`), removed `xlsx` from prod, excluded `scripts/` from `tsconfig` | Code — `package.json` |
| F12 | ✅ | High | `experiments/housky.py` *(deleted 2026-08-28)* | Hardcoded `api_key 0e7cd394...` ×3 — **deleted**, not in `src/` — no prod use |

---

## 3. Open — Medium (code)

| # | Status | Severity | Location | What is left | Fix | Owner |
|---|--------|----------|----------|--------------|-----|-------|
| F14 | ✅ | Medium | `src/app/api/profile/two-factor/route.ts:67` + `src/app/profile/page.tsx` *(fixed 2026-08-28)* | `disable` no re-auth — **fixed** (OTP confirmation via `issueLoginOtp`/`verifyLoginOtp`, snackbar `code sent to email` → `Verify & Disable`, `429` cooldown) | Code |
| F15 | ✅ | Medium | `sentry.*.config.ts` *(fixed 2026-08-28)* | `tracesSampleRate:1` 100% — **fixed** (`0.1` + `beforeSend` scrub `*_API_KEY`/phones/`[OTP]`) | Code |
| F16 | ✅ | Medium | `auth/forgot-password` + `lockout-status` + `login-security.ts` *(fixed 2026-08-28)* | No IP limit — **fixed** (in-memory `isIpRateLimited` 5/min forgot-password, 10/min lockout-status; `requestIp` + 429) | Code |
| F17 | ⏳ | Medium | `src/conductor/worker.ts` `POSTGRES_URL` | Worker uses raw superuser DB on laptop — holder can poison `JobQueue` | Create `tower_worker` role (JobQueue R/W only) or use CRON_SECRET HTTP endpoint | Infra + Code |
| F18 | ✅ | Medium | `InformationService.ts:207,215,231` *(fixed 2026-08-28)* | Verbose `console.log` ReportAll — **fixed** (truncate to 500 chars, `…(truncated)`, no full `JSON.stringify` dump) | Code |

---

## 4. Open — Medium/Low (accepted risk or hygiene)

| # | Status | Severity | Location | What is left | Note |
|---|--------|----------|----------|--------------|------|
| F19 | ◐ | Medium | `src/middleware.ts:21` | Revocation `catch {revoked=false}` fail-open during DB outage (7d JWT). APIs also stay usable during `forcedPasswordChange`. | Accepted — avoids locking everyone out. Mitigate with short JWT (1h) + alert, doc trade-off |
| F20 | ✅ | Low | `lib/jobs/*` `src/lib/job-queue.ts` *(fixed 2026-08-28)* | No dedup — **fixed** (`findFirst` pending `jobType+params` dedup, `ponytail: DB hash if throughput grows`) |
| F21 | ◐ | Low | `next@16.1.6` `@prisma/client@6.19.3` | Stale GHSA-ggv3 etc. — **accepted** (defer bump, no breaking change now; track in Dependabot) | `npm update next@16.3.3 @prisma/client@7` when ready |
| F22 | ◐ | Low | `.github/` | No workflows — no SAST/Dependabot — **accepted** (Vercel builds, defer full CI; enable Dependabot only) | Enable `.github/dependabot.yml` weekly `npm`; add `ci.yml` later if needed |
| F23 | ℹ️ | Low | `FCCService.ts` `playwright-extra-stealth` | Stealth scrape, no `robots.txt` check — fragile, not a vuln | Doc + throttle, keep `FCC_HEADED=1` |
| F27 | ✅ | Low | `auth.config.ts:56` / `.env.example` | Dual `NEXTAUTH_SECRET \|\| AUTH_SECRET` — **fixed** (now `NEXTAUTH_SECRET` only, `AUTH_SECRET` removed) |

---

## 5. Info — no fix (already clean, kept for allowlist)

| # | Status | Severity | Location | Note |
|---|--------|----------|----------|------|
| F24 | ℹ️ | Info | 14 outbound hosts | All explainable (Resend, ReportAll, NRCan, Geoapify, Overpass, Nominatim, NumVerify, ArcGIS, FCC, AntennaSearch, CellMapper, Whitepages, Sentry, Houski-experiments) — no rogue host. Keep allowlist in docs. |
| F25 | ℹ️ | Info | Supply chain | No typosquat, only `postinstall: prisma generate`, `.env` gitignored |
| F26 | ℹ️ | Info | Runtime | `pg_stat_activity` only audit+worker, `JobQueue` legit types, `LoginEvent` normal |
| — | ✅ | — | Fixed in PR #9 | F01, F02, F05, F06, F07, F08, F09, F10, F13 — see report §4 |

---

## 6. Open — Human handoff (console-only, agent did not attempt)

These are the ⏳ items above plus the checklist from the main report — complete them in order, **after** pulling logs:

- [ ] **Vercel env audit:** Dashboard → Settings → Env Vars — who can edit, when `CRON_SECRET`/`NEXTAUTH_SECRET`/`RESEND_API_KEY`/`REPORTALL_API_KEY`/`POSTGRES_URL` last rotated. Remove ex-dev from team. Verify `CRON_SECRET` set in all envs.
- [ ] **Vercel logs:** Last 30d — unusual hits to `/api/cron/*`, `/api/admin/fix-provinces`, `/api/owners`, `/api/towers/export?all=true`, `/api/search-towers` large bbox, off-hours anon, any 200 on cron without Bearer.
- [ ] **Neon query logs:** Console → Query History — DDL (`CREATE FUNCTION/TABLE`, `ALTER ROLE`), `User` writes (`UPDATE role`/`INSERT ADMIN`), `COPY` exports. Verify `prisma_migration` superuser usage.
- [ ] **Credential rotation (after logs):** `POSTGRES_URL`/`PRISMA_DATABASE_URL` (Neon rotate + Vercel update), `CRON_SECRET`, `NEXTAUTH_SECRET`/`AUTH_SECRET`, `RESEND_API_KEY`, `REPORTALL_API_KEY`, `GEOAPIFY_API_KEY`, `WHITEPAGES_API_KEY`, `NUMVERIFY_API_KEY`, `SUPABASE_KEY`, `SENTRY_DSN`, Houski `0e7cd39…`. Rotate `admin@tower-finder.com` if `admin123` ever live.
- [ ] **Live spot-check (with prod creds outside agent):** Expect 401 — `GET /api/owners`, `POST /api/admin/fix-provinces?limit=1`, `GET /api/cron/process-jobs` without Bearer, `POST /api/towers/export {"all":true}` as CALLER.
- [ ] **DB role hardening (F03):** Neon SQL as superuser one last time — create `tower_app`, re-grant, update Vercel app URL, then `ALTER ROLE prisma_migration NOSUPERUSER`.
- [ ] **Migration resolve (F04):** `npx prisma migrate resolve --applied 20260811031542_login_otp` or `--rolled-back` per docs after verifying `LoginOtp` shape.

---

## 7. How this file is used

- PR #9 body now embeds the **progress table** below so reviewers see `✅/❌/⏳` live. This file is the durable tracker for the **open** items only.
- When an ⏳ or ❌ item is completed, move it to the ✅ section in the main report and remove it from this file (or mark ✅ here). Keep `SECURITY_AUDIT_FINDINGS.md` as the immutable ledger.

---

## 8. Progress table (same as PR body — copy-paste friendly)

| # | Status | Severity | Location |
|---|--------|----------|----------|
| F01 | ✅ | Critical | `owners` mass PII — fixed |
| F02 | ✅ | Critical | `fix-provinces` unauth write — fixed |
| F03 | ⏳ | Critical | DB superuser — human |
| F04 | ⏳ | Critical | Stuck migration — human |
| F05 | ✅ | High | `discovery-progress` leak — fixed |
| F06 | ✅ | High | Cron fail-open — fixed |
| F07 | ✅ | High | `MASTER_PASSWORD` fallback — fixed |
| F08 | ✅ | High | `towers/export` IDOR — fixed |
| F09 | ✅ | High | 5 routes unauth — fixed |
| F10 | ✅ | High | `notes DELETE` — fixed |
| F11 | ✅ | High | `xlsx` — fixed (removed, exceljs only) |
| F12 | ✅ | High | Houski `housky.py` — **deleted** (`experiments/housky.py`, `test_ownership.py` removed 2026-08-28) — no prod use |
| F13 | ✅ | Medium | `http`→`https` NumVerify — fixed |
| F14 | ✅ | Medium | 2FA disable — fixed (OTP + snackbar) |
| F15 | ✅ | Medium | Sentry 100% — fixed (0.1 + scrub) |
| F16 | ✅ | Medium | No IP limit — fixed (5/min + 10/min) |
| F17 | ⏳ | Medium | Worker superuser — open human |
| F18 | ✅ | Medium | Verbose PII logs — fixed (truncated) |
| F19 | ◐ | Medium | Middleware fail-open — accepted |
| F20 | ✅ | Low | JobQueue dedup — fixed |
| F21 | ◐ | Low | `next` stale — accepted (defer) |
| F22 | ◐ | Low | No CI — accepted (Vercel + Dependabot) |
| F23 | ℹ️ | Low | FCC stealth — info |
| F24-26 | ℹ️ | Info | Clean — no fix |
| F27 | ✅ | Low | Dual secret — fixed (NEXTAUTH_SECRET only) |

**Summary:** ✅ 18 fixed · ⏳ 3 human · ❌ 0 code · ◐ 3 accepted · ℹ️ 3 info = 27
