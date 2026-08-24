# Unused Docs & Excel Files Report — tower-finder

**Generated:** 2026-08-25
**Scope:** `docs/` folder contents and root-level `.xlsx` files
**Method:** Same reference-tracing approach as the root purge — exact-match text search plus import analysis across all source (`src/`, `scripts/`, `prisma/`, configs, other docs). A file is listed only when nothing in the codebase or backend reads, imports, loads, or serves it.

> Note: `.md` files are **excluded from deletion scope** per instruction — they are kept and only assessed for cross-references.

---

## 1. Root-level .xlsx

| File | Size | Referenced by code? | Verdict |
|---|---:|---|---|
| `Tower_Site_Examples.xlsx` | 14.1 KB | No — zero matches in any source file | **DELETED** (2026-08-25, commit on `chore/purge-unused-root-files`) |

Was likely a client-supplied sample of real tower rows used during initial Excel-import development. The import scripts that consume `.xlsx` files point at `sources/*.xlsx` paths instead — never at this file.

## 2. docs/ — Excel files

| File | Size | Referenced by code? | Cross-referenced in docs? | Verdict |
|---|---:|---|---|---|
| `docs/Tower_Lead_AI_Classifier_Client_Proposal.xlsx` | 9.4 KB | No | Yes — mentioned in `docs/tower-lead-ai-classifier-plan.md` (line 186), but pointing at a *different* copy in `cpd-courses/plans/` | **Unused duplicate** — safe to delete; the referenced original lives elsewhere |
| `docs/iHunter_Landowner_Scraper_Proposal.xlsx` | 12.2 KB | No | No — not mentioned by any file in the repo | **Fully orphaned** — safe to delete |

Neither is loaded by any backend/service code. They are static proposal documents, not data inputs.

## 3. docs/ — Markdown files (assessed, NOT deleted)

Kept per instruction. Status for awareness:

| File | Referenced by code? | Notes |
|---|---|---|
| `docs/fcc_discovery_engine.md` | No | Reference notes on FCC discovery engine; standalone doc |
| `docs/ihunter-landowner-scraper.md` | No | Scraper proposal/spec doc; pairs with the xlsx above |
| `docs/phase0-label-audit.md` | **Yes** — cited by comment in `scripts/backfill-tower-labels.ts:3` | Active documentation for a script in use |
| `docs/rooftop_verification.md` | No | Verification methodology notes |
| `docs/tower-lead-ai-classifier-plan.md` | No (references others) | Plan document; links out to proposal xlsx |
| `docs/entities/*.md` (5 files) | No | Schema/entity documentation set (tower, parcel, owner, contact, overview) |

## 4. Backend connection check

Confirmed none of the files above are connected to the backend:

- No `fs.readFileSync` / `import` / `require` targets them anywhere in `src/` or `scripts/`
- Nothing in `public/` serves them (they're outside `public/`)
- Prisma schema and API routes have no path references to `docs/`
- The only `.xlsx` files the backend actually touches are runtime-generated exports (`towers_export_*.xlsx` via `/api/towers/export`) and import sources under `sources/` — unrelated to these

## Recommended actions

1. ~~Delete `Tower_Site_Examples.xlsx`~~ ✅ Done.
2. Delete `docs/Tower_Lead_AI_Classifier_Client_Proposal.xlsx` (duplicate) and `docs/iHunter_Landowner_Scraper_Proposal.xlsx` (orphaned).
3. Keep all `docs/*.md` and `docs/entities/`.
