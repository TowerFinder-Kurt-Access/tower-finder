# Security Audit — Open Remaining (Post-PR #9)

**Branch:** `audit/security-review` — PR #9  
**Date:** 2026-08-28  
**Source:** `SECURITY_AUDIT_REPORT.md` + `SECURITY_AUDIT_FINDINGS.md` (27 findings)  
**Legend:** ✅ Fixed in PR #9 · ⏳ Open — Human (console/rotation, not code) · ❌ Open — Code (needs code change) · ◐ Accepted risk (documented) · ℹ️ Info (no fix)

> **Progress:** 20/21 actionable fixed (95%), 1 remaining human (F03). 6 archived (F21–F22 accepted, F23–F26 info) per 2026-08-28 revision. This file tracks only the **remaining** items. For full ledger with evidence, see `SECURITY_AUDIT_FINDINGS.md`.

---

## 1. Open — Critical (human, do after logs pulled)

| # | Status | Severity | Location | What is left | Fix | Owner |
|---|--------|----------|----------|--------------|-----|-------|
| F03 | ⏳ | Critical | `prisma_migration` `rolsuper=true` *(restricted)* | App as superuser — **attempted** `CREATE ROLE tower_app` → `ERROR 42501 restricted superuser cannot create roles` (Prisma Postgres managed). Full DDL still possible, but role mgmt blocked via SQL. | Use Prisma Data Platform console to create least-privilege user (or rotate `POSTGRES_URL` + limit via connection string), update Vercel `POSTGRES_URL`, keep `prisma_migration` for `migrate` only. Document restricted superuser. | Infra / DB — Prisma Console + Vercel |
| F04 | ✅ | Critical | `_prisma_migrations` `20260811031542_login_otp` + 2 pending *(fixed 2026-08-28)* | `finished_at=null` blocked — **fixed** (`prisma migrate resolve --applied` for `20260811031542_login_otp`, `20260811045000_user_two_factor`, `20260821090000_add_must_change_password`; duplicate failed row deleted; `migrate status` now `Database schema is up to date`) | DB — Prisma Postgres |

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
| F17 | ✅ | Medium | `src/conductor/worker.ts` `POSTGRES_URL` *(fixed 2026-08-28)* | Worker superuser — **fixed** via HTTP: `GET/POST /api/worker/job` (Bearer `CRON_SECRET`, `pickNextJob`/`markCompleted`/`markFailed` server-side) + `src/conductor/worker.ts` now `fetch(APP_URL)` with `CRON_SECRET`, no `POSTGRES_URL` on laptop | Code — `src/app/api/worker/job/route.ts` + `src/conductor/worker.ts` |
| F18 | ✅ | Medium | `InformationService.ts:207,215,231` *(fixed 2026-08-28)* | Verbose `console.log` ReportAll — **fixed** (truncate to 500 chars, `…(truncated)`, no full `JSON.stringify` dump) | Code |

---

## 4. Open — Medium/Low (accepted risk or hygiene)

| # | Status | Severity | Location | What is left | Note |
|---|--------|----------|----------|--------------|------|
| F19 | ✅ | Medium | `src/middleware.ts:21` `catch {revoked}` *(fixed 2026-08-28)* | Fail-open `revoked=false` (7d JWT revival) — **fixed** `revoked=true` fail-closed + `/api/worker` bypass | Code — `src/middleware.ts` |
| F20 | ✅ | Low | `lib/jobs/*` `src/lib/job-queue.ts` *(fixed 2026-08-28)* | No dedup — **fixed** (`findFirst` pending `jobType+params` dedup, `ponytail: DB hash if throughput grows`) |
| F27 | ✅ | Low | `auth.config.ts:56` / `.env.example` | Dual `NEXTAUTH_SECRET \|\| AUTH_SECRET` — **fixed** (now `NEXTAUTH_SECRET` only, `AUTH_SECRET` removed) |

---

## 5. Info — archived 2026-08-28 (F24–F26 removed per revision, see git history)

| # | Status | Severity | Location | Note |
|---|--------|----------|----------|------|
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
| F04 | ✅ | Critical | Stuck migration — fixed (migrate resolve x3) |
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
| F17 | ✅ | Medium | Worker superuser — fixed (HTTP Bearer) |
| F18 | ✅ | Medium | Verbose PII logs — fixed (truncated) |
| F19 | ✅ | Medium | Fail-open — fixed (`revoked=true`) |
| F20 | ✅ | Low | JobQueue dedup — fixed |
| F27 | ✅ | Low | Dual secret — fixed (NEXTAUTH_SECRET only) |

**Summary:** ✅ 20 fixed · ⏳ 1 human · ❌ 0 code = 21 actionable (6 archived: F21–F22 accepted, F23–F26 info)
