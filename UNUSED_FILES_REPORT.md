# Unused Files Report — tower-finder

**Generated:** 2026-08-23 · **Purged:** 2026-08-25 (branch `chore/purge-unused-root-files`)
**Scope:** Repository root files (`.html`, `.png`, `.json`, `.xlsx`, one-off scripts)
**Method:** Every root file was traced for references across `src/`, `scripts/`, `prisma/`, `docs/`, `conductor/`, `experiments/`, `scratch/`, and `tmp/` using exact-match text search plus import-statement analysis. Build caches (`.next/`), the knowledge-graph index (`graphify-out/`), and `node_modules` were excluded so results reflect real project usage only. No file listed below is imported, required, read, or executed by anything in the codebase.

---

## 1. Fully orphaned artifacts (nothing reads or writes them)

| File | Size | Kind | Notes |
|---|---:|---|---|
| `debug_geo_real.png` | 128 KB | screenshot | No generator script found; stale manual capture |
| `houski_results.json` | 707 B | data dump | Output of an `experiments/` fetch script; never consumed |
| `ownership_test_results.json` | 821 B | data dump | Same origin as above |
| `reportall_api_sample_query.md` | 3.7 KB | notes | Sample API query documentation; referenced nowhere |
| `ts_errors.txt` | 2.2 KB | log | Saved TypeScript error output from a past session |
| `locations_export_for_support.json` | **14 MB** | data export | Regenerable via `scripts/export_towers_for_support.js`; committed to git |
| `locations_unknowns_for_support.json` | 22 KB | data export | Companion to above |

**Total recoverable:** ~14.2 MB, of which ~14 MB is a single regenerable JSON export tracked in git.

## 2. Orphaned outputs of dead one-off scripts

These files are written by standalone debug scripts that nothing imports or runs. The files themselves are unused; the generators are equally disposable.

| File | Size | Written by (also unused) |
|---|---:|---|
| `debug_page.html` | 144 KB | `src/test-debug.ts` |
| `debug_geo.html` | 141 KB | `src/test-debug-geo.ts` |
| `debug_geo_real.html` | 141 KB | `src/test-debug-real.ts` |
| `direct_results.html` | 324 B | `src/test-direct-results.ts` |
| `cali_results.html` | 35 B | `src/test-county.ts` |
| `cali_results.txt` | 106 B | `src/test-county2.ts`, `src/test-county3.ts` |
| `debug_initial.png` | 160 KB | `src/test-debug.ts` |
| `debug_geo_initial.png` | 120 KB | `src/test-debug-geo.ts` |
| `geo_pre_submit_cook.png` | 93 KB | `src/test-geo-cook.ts` |
| `google_sanity.png` | 24 KB | `src/sanity.ts` |
| `county_search_results.png` | 54 KB | `src/test-county.ts`, `src/test-advanced-county.ts` |
| `county_test_error.png` | 102 KB | `src/test-advanced-county.ts` |
| `before_submit.png` / `after_submit.png` | 90 + 54 KB | `src/test-county3.ts` |
| `direct_results.png` | 15 KB | `src/test-direct-results.ts` |
| `direct_url_result.png` | 54 KB | `src/test-direct.ts` |
| `discovery_error.png` | 104 KB | `src/discovery-alameda.ts` |

## 3. Dead one-off scripts at repo root

Referenced nowhere — no imports, no package.json scripts, no docs:

| Script | Size | Purpose (inferred) |
|---|---:|---|
| `analyze_geometry.ts` | 1.9 KB | Geometry analysis experiment |
| `check_db.ts` | 739 B | Ad-hoc DB connectivity check |
| `check_towers.ts` | 1.1 KB | Ad-hoc tower table check |
| `check_columns.js` | 473 B | Excel column inspection |
| `inspect_excel.js` | 806 B | Excel inspection helper |
| `list_names.js` | 219 B | Parses `debug_page.html` (itself an artifact) |
| `list_names_geo.js` | 223 B | Variant of above |
| `quick_stats.ts` | 1.0 KB | Quick DB statistics |
| `raw_stats.ts` | 897 B | Raw DB statistics |
| `find_canada_towers.ts` | 1.0 KB | One-off tower search |
| `test_batch.ts` | 279 B | Batch job smoke test |
| `test_nrcan_job.ts` | 1.1 KB | NRCan job test |
| `test_nrcan_single.ts` | 422 B | NRCan single-record test |

Also note `jsconfig.json` is redundant — `tsconfig.json` already defines the same `@/*` path alias.

## 4. Flagged but NOT recommended for deletion

| File | Reason kept |
|---|---|
| `Tower_Site_Examples.xlsx` | Unreferenced by code but appears to be client-provided input data |
| `docs/*.xlsx`, `docs/*.md` | Documentation/proposals, not build inputs |
| `_legacy_backup/` | Explicitly marked legacy; out of scope per AGENTS.md |

---

### Recommended actions

1. ~~Delete all files in sections 1–3~~ ✅ Done 2026-08-25 (61 files total incl. generators).
2. ~~Remove their generator scripts~~ ✅ Done (21 files from `src/`).
3. ~~Add ignore patterns to `.gitignore`~~ ✅ Done.

---
## Purge log (2026-08-25)

Executed on branch `chore/purge-unused-root-files`:

| Action | Files |
|---|---|
| Section 1 artifacts deleted | 7 (incl. 14 MB `locations_export_for_support.json`) |
| Section 2 outputs deleted | 17 |
| Section 3 root scripts deleted | 13 |
| Generator scripts removed from `src/` | 24 (`src/test-*.ts`, `sanity.ts`, `discovery-alameda.ts`, `check-conn.ts`, `discovery-final-alameda.ts`, `verify-alameda-rooftop.ts`) |
| `.gitignore` patterns added | root-level `*.png`, `*.html`, result dumps, support exports |

**Verification:** `npm run build` passes clean (exit 0, no errors; only pre-existing Sentry deprecation warnings). All deletions recoverable via git history.
