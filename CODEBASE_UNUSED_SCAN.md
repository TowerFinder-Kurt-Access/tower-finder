# Full Codebase Unused-Files Scan — tower-finder

**Generated:** 2026-08-25 · **Branch:** `chore/purge-unused-root-files`
**Method:** Every remaining file traced via exact-match reference search + import analysis across `src/`, `scripts/`, `prisma/`, configs, and docs. Excluded from scan: `node_modules/`, `.next/`, `graphify-out/` (index), `.env`. Nothing listed is imported, read, served, or executed by app or backend code.

---

## 1. Safe to delete — unreferenced data & assets

| File | Referenced? | Verdict |
|---|---|---|
| `data/chicago.geojson`, `data/illinois.geojson`, `data/sf_boundary.geojson` | Only by generic pattern in `src/scripts/seed-discovery.ts` (`data/<state>.geojson`) | Keep if discovery-seeding by these regions is still planned; else delete |
| `public/*.svg` (file, globe, next, vercel, window) | No — Next.js scaffold defaults, zero imports | Delete |

## 2. Safe to delete — dead one-off scripts (`scripts/`)

No imports, no package.json entries, no doc citations:

| Group | Files |
|---|---|
| Ad-hoc DB checks | `analyze_oda_stats.js`, `check_addresses.js`, `check_counts.js`, `check_db_data.js`, `check_phones.ts`, `check_users.js`, `check-province-status.ts` |
| One-off backfills/migrations already run | `backfill_raw_data.ts`, `clear_towers.js`, `fix-all-provinces.ts`, `migrate_status.js`, `enqueue_phone_validation.ts` |
| Excel inspectors (superseded) | `inspect-excel.js`, `inspect_excel_tool.js`, `inspect_ontario.js`, `parse_addresses.js`, `import_excel.js`, `import-notes.js`, `upsert_ontario_notes.js`, `verify_import.ts`, `verify-import.js` |
| Stale backups | `inspect-carriers.ts.bak`, `migrate-licensees-to-carriers.ts.bak` |
| Test scripts | `test_db_models.ts`, `test_export.ts`, `test_password.js` |
| Misc one-offs | `batch_fetch_owners.js`, `export-ihunter-counties.ts`, `generate_city_list.ts`, `ihunter-backfill-screenshots.ts`, `seed_cities.ts`, `inspect-duplicate-carriers.ts` |

## 3. Chain-referenced but dormant (delete as a group or keep as a group)

These reference each other, so they must be removed together or not at all:

| Chain | Files | Status |
|---|---|---|
| ML classifier pipeline | `scripts/backfill-tower-labels.ts` → `scripts/train-tower-classifier.ts` → `scripts/score-towers.ts` → `src/lib/ml/model.json` + `features.ts` | Trained model exists; not used by the app itself. Keep if retraining planned |
| iHunter scraper suite | `scripts/ihuner-web-scraper.ts`, `ihunter-vlm.ts`, `ihunter-storage.ts`, `ihunter-ocr.ts` | App *reads* scraped URLs (`Parcel.ihunterCloseupUrl`) but scraper isn't wired to runtime; doc-cited only |
| Albert ownership experiments (`experiments/`) | All 6 files + 2 JSON outputs + `fetch_log.txt` | Self-contained Python experiments; nothing outside folder references them |

## 4. Connected — do NOT delete

| Area | Why it's live |
|---|---|
| `src/lib/canadian_cities.json`, `canadian_counties.json` | Imported by `official-cities.ts`, `LocationNormalizationService`, migrations, checks |
| `src/lib/ml/*` | Read by scoring pipeline (see §3) |
| `docs/phase0-label-audit.md` | Cited by live script |
| `scripts/checks/`, `scripts/migrations/`, `scripts/imports/` | Operational utilities referencing canadian JSONs; migration history |
| `prisma/`, `src/app/`, `src/services/`, configs | Application core |

## Verification

- `npm run build` clean on current branch
- No file in §1–§3 has any import/read/served path from app or backend runtime
