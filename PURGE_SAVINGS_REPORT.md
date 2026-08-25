# Purge Savings Report — tower-finder

**Generated:** 2026-08-25 · **Branch:** `chore/purge-unused-root-files` (PR #5)
**Baseline:** `origin/master` → **Head:** `b14926b` + hydration fix (uncommitted)
**Totals:** 80 files deleted · 15.4 MB removed from the repo · 552,962 lines of code/artifacts erased

---

## Deletions by category, with size savings

| # | Category | Files | Bundle/Repo Size Saved | Notes |
|---|---|---:|---:|---|
| 1 | Orphaned data dumps (`locations_export_for_support.json`, unknowns, houski, ownership) | 4 | **14.1 MB** | Single largest win — 14 MB was one regenerable JSON export |
| 2 | Debug screenshots & HTML dumps (root `*.png` / `*.html`) | 17 | ~1.3 MB | Inert debug captures from FCC/scraping sessions |
| 3 | Dead one-off root scripts (`check_*`, `list_names*`, `test_nrcan*`…) | 13 | ~12 KB | Never imported, run, or scheduled |
| 4 | Dead generator scripts in `src/` (`test-*.ts`, `sanity.ts`, discovery one-offs) | 24 | ~55 KB | Verified zero importers before deletion |
| 5 | `_legacy_backup/` pre-Next.js prototype | 11 | ~60 KB | Superseded server.js app incl. duplicate xlsx |
| 6 | AI tooling folders (`.agent/`, `.claude/`) | 4 | ~4 KB | Local assistant configs/skills only |
| 7 | Proposal xlsx docs (root + `docs/`) | 3 | ~36 KB | Paperwork; classifier copy was a duplicate |
| 8 | Duplicate API route (`src/app/api/geocode/route.js`) | 1 | <1 KB runtime; removes dev warning + route ambiguity | Caller-verified before removal |
| | **Total** | **~80** | **~15.5 MB repo weight** | |

## What the savings actually mean

| Metric | Before purge | After purge | Saved |
|---|---:|---:|---:|
| Repo working-tree payload (deleted files alone) | — | — | **15.4 MB** |
| Lines in tracked files | — | — | **−552,962** (99.99% of it the 14 MB JSON) |
| Client JS bundle impact | — | — | **0 KB*** |
| Dev-server warnings fixed | 3+ per start (middleware deprecation, 2× duplicate page) | middleware warning only | 2 eliminated |
| Git clone/fetch size for new contributors | inflated by 14 MB blob | trimmed going forward | future clones skip it |

\* **Honest note on bundle size:** none of the deleted files were part of the client bundle — they were scripts, screenshots, and data dumps outside `src/app` import graphs and `public/`. So the deployed Next.js JS bundle is unchanged; the real savings are repo weight, git history bloat (the 14 MB blob stays in history until GC/rebase), dev-server noise, and maintenance surface.

## Remaining follow-up candidates (not deleted, documented)

| Candidate | Est. size | Why deferred |
|---|---:|---|
| `experiments/` Python suite + outputs | ~310 KB | Self-contained; delete as a group if Alberta ownership work is done |
| Dormant ML pipeline (`scripts/*classifier*`, `score-towers.ts`) | ~15 KB | Keep if retraining planned |
| iHunter scraper suite | ~40 KB | App reads scraped URLs; scraper itself unwired |
| `public/*.svg` scaffold defaults | ~3 KB | Zero imports; trivial win |
| `data/*.geojson` boundaries | ~46 KB | Needed if region-seeding resumes |

## Verification snapshot at review time

- `npm run build`: exit 0
- Reference traces re-run post-purge: zero dangling references to any deleted file
- DB/prisma untouched: 0 files changed under `prisma/`
