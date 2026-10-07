# Plan: AI-assisted triage of tower leads (tower vs. not-a-tower)

## Context

Tower discovery jobs (FCC, FAA, ArcGIS, OSM, CellMapper) produce a large pool of
candidate `TowerLead` records. A human currently reviews them one-by-one and
"promotes" the real towers. Only ~20% has been reviewed, and review is slow.

Goal: use the already-reviewed leads as training data to **score the unreviewed
~80% with a "tower likelihood"**, so the human reviews the most-likely towers
first and can skip obvious junk. We keep the human in the loop (rank + score,
not auto-delete) and use a lightweight **structured ML classifier** over the
fields each lead already carries.

### ⚠️ Phase 0 completed 2026-06-11 — premise corrected
The audit (`scratch/audit_lead_labels.ts`, report in `docs/phase0-label-audit.md`)
found the original premise wrong: only **6 of 16,155 leads** were ever promoted
(not ~20% reviewed). The human review labels actually live on the **`Tower`**
table from the Excel-import pipeline: 1,902 positive-status towers and 2,497
"not a tower" verdicts (status "No GSV" + "no cell"/"no tower" notes). However,
**labels and features never co-occur** — labeled towers (all Canada) carry no
structured attributes, while leads (86% US) carry rich tags but no labels — so
training directly on Tower labels to score leads is a no-go. The plan's fallback
is now the main path: **ship the label-collection UI first** (revised Phase 1
below), backfill what can be mined, and train (Phases 2-3) once lead-native
labels accumulate. See the audit report's §5-6 for the confirmed labeling rule
and full reasoning.

### The core challenge (read this first)
The DB only records the **positive** signal: `TowerLead.promotedToTowerId` set =
confirmed tower. There is **no stored "human said NOT a tower"** label on leads,
and a non-promoted lead is indistinguishable from a never-reviewed one. The
"not a tower" verdicts that do exist are on `Tower` records (status "No GSV",
"No cellsites" notes) in Canada, while the lead queues needing scores are in the
US — wrong population for direct training (see audit report).

## Data we have (confirmed by exploration)

Per `prisma/schema.prisma` (`TowerLead`, lines 248-269), each lead has:
`lat`, `lon`, `source` (e.g. `ARCGIS_CT`, `FCC_ULS`, `OpenStreetMap`),
`sourceId`, `type` (`rooftop`/`tower`/`Building`), `province`, `city`,
`country`, `createdAt`, `updatedAt`, `promotedToTowerId`, and a rich `tags` JSON
(observed keys: `Licensee`, `Callsign`, `StrucType`, `LocAdd`, `LocCity`,
`LocCounty`, `LocState`, height, etc.).
`h3-js` is already a dependency — usable for spatial density features.
The repo is **greenfield for ML** (no openai/anthropic/sklearn deps).

## Approach

### Phase 0 — Data audit & label-mining (read-only, no schema change) ✅ DONE
Done 2026-06-11. Script: `scratch/audit_lead_labels.ts`; full report with the
confirmed labeling rule and go/no-go: `docs/phase0-label-audit.md`. Outcome:
labels exist but on `Tower` (Canada), not on leads (US) — direct training is a
no-go; proceed with label collection + backfill (revised Phase 1), train later.

### Phase 1 — Tower-side classifier ✅ IMPLEMENTED 2026-06-11
User decision: use the labels we already have *now* — assign `not_tower` from
the notes — rather than waiting on lead-native label collection. The classifier
therefore targets the **47,139 unreviewed `Tower` records** (statusId null or
"New"), not `TowerLead`. What shipped:
- **Schema** (`prisma/schema.prisma`, `Tower`): `humanLabel`, `labelSource`,
  `labeledAt`, `aiTowerScore`, `aiLabel`, `aiClassifiedAt`, `aiModelVersion`
  + indexes (migration `20260611180500_add_tower_ai_classifier_fields`,
  applied via `migrate diff`/`db execute` — hosted DB has no shadow-DB support).
- **Backfill** `scripts/backfill-tower-labels.ts` (idempotent, re-runnable):
  `not_tower` = status "No GSV" ∪ `no cell`/`no tower`/`not a tower` note →
  2,481; `tower` = positive statuses {3,5,10-15,17} → 1,886; 16 conflicted
  skipped.
- **Features** `src/lib/ml/features.ts` — shared by train + score:
  businessCount, avgBusinessDistance, H3 density / nearest-tower distance,
  source-file region, lat/lon. Leakage exclusions documented in the file
  (typeId, statusId, notes, legacyStatus).
- **Training** `scripts/train-tower-classifier.ts` — `ml-random-forest`,
  stratified 80/20, AUC/precision/recall/confusion + permutation importance,
  serialized to `src/lib/ml/model.json`. **Held-out AUC 0.716** (gate ≥0.7
  passed); details in the audit report addendum (§7).
- **Scoring** `scripts/score-towers.ts` — writes scores to the unreviewed pool;
  re-run after each retrain.
- **UI** — "AI Score" chip column + server-side sorting in
  `src/components/TowerTableSimple.tsx` / `src/app/towers/page.tsx`;
  `sort=aiTowerScore` in `GET /api/towers`.

Retrain loop: as reviewers keep setting statuses/notes, re-run backfill →
train → score (three commands, see script headers).

### Phases 2-5 below — original lead-side design (NOT yet implemented)
Kept for reference: scoring `TowerLead` still requires lead-native labels
(discard button) or a heuristic prior; revisit after the tower-side score
proves itself in review.

### Phase 2 — Feature extraction (shared module)
New `src/lib/ml/features.ts` — pure function `leadToFeatures(lead)` producing a
numeric/encoded vector, reused by both training and inference so they can't drift:
- one-hot: `source`, `type`, `tags.StrucType`, `country`;
- booleans: has `sourceId`, has `Callsign`, has `Licensee`, has address (`LocAdd`), licensee matches known carrier;
- numeric: tag-key count (richness), and **spatial density** = count of other leads in the same/neighboring H3 cell (via `h3-js`, already installed) — towers tend to be isolated, rooftops clustered;
- keep a stable feature-name list serialized with the model.

### Phase 3 — Train classifier (offline script)
New `scripts/train-lead-classifier.ts`:
- pull `reviewed = true` leads, build features + `humanLabel` target;
- stratified train/test split; train a **structured model** from the pure-JS
  `ml.js` suite (recommend `ml-random-forest` for nonlinear categorical
  interactions; `ml-logistic-regression` as the explainable baseline);
- report **AUC, precision/recall, confusion matrix** on the held-out set and
  feature importance, so we trust the score before relying on it;
- serialize model + feature list + threshold to `src/lib/ml/model.json` (pure
  JSON → loads in-process on Vercel, no native deps, no per-record API cost).

### Phase 4 — Inference job (score the unreviewed pool)
- New handler `src/lib/jobs/classifyLeads.ts` registered in
  `src/lib/job-handlers.ts`; job type `classify_tower_leads` enqueued via the
  existing `src/lib/job-queue.ts` and run by `src/app/api/cron/process-jobs/route.ts`.
- Loads `model.json`, scores leads in batches where `reviewed = false`, writes
  `aiTowerScore`, `aiLabel`, `aiClassifiedAt`, `aiModelVersion`.
- A trigger route (mirror `src/app/api/cron/trigger-normalization/route.ts`) to kick it off.

### Phase 5 — Surface in review UI (rank + score)
In `src/app/tower-leads/page.tsx` (DataGrid):
- add an **"AI score"** column (e.g. % with a colored `Chip`) and default sort by
  `aiTowerScore desc` for the not-promoted view;
- add a score filter (e.g. "likely towers only");
- add a **"Not a tower"** action button → new `POST /api/tower-leads/[id]/discard`
  (mirrors `src/app/api/tower-leads/[id]/promote/route.ts`) that sets
  `humanLabel = "not_tower"`, `reviewed = true`, `reviewedAt`. This both speeds
  triage and **keeps collecting clean negatives** to retrain on.
- extend `GET /api/tower-leads` (`src/app/api/tower-leads/route.ts`) to sort/filter by score.

## Critical files
- `prisma/schema.prisma` — `TowerLead` fields + migration (Phase 1).
- `src/lib/ml/features.ts`, `scripts/train-lead-classifier.ts`, `src/lib/ml/model.json` (Phases 2-3).
- `src/lib/jobs/classifyLeads.ts`, `src/lib/job-handlers.ts`, `src/app/api/cron/process-jobs/route.ts` (Phase 4).
- `src/app/tower-leads/page.tsx`, `src/app/api/tower-leads/route.ts`, `src/app/api/tower-leads/[id]/discard/route.ts` (Phase 5).
- `scratch/audit_lead_labels.ts` (Phase 0, throwaway).

## Verification
1. **Phase 0:** ✅ done — audit found hundreds+ labels per class but on the wrong
   population (`Tower`/Canada, not leads/US); per the pre-agreed fallback, Phase 1
   ships the "Not a tower" button + backfill to collect lead-native labels first.
2. **Training:** held-out **AUC ≥ ~0.8** and inspect feature importance for
   sanity (e.g. `StrucType`, `source`, density dominate). Eyeball the
   highest-confidence false predictions.
3. **Inference:** run the job on a small province; spot-check the top-scored and
   bottom-scored unreviewed leads against Google satellite (the existing
   satellite-link buttons) — high scores should look like real sites.
4. **UI:** confirm the not-promoted grid sorts by score, the score chip renders,
   and "Not a tower" sets `humanLabel`/`reviewed` and removes the lead from the queue.
5. **Loop:** after humans discard/promote more, re-run training and confirm
   metrics improve.

## Commercial / pricing (fixed price @ $30/hr)

Mirrors the format of `cpd-courses/plans/Training_Platform_Client_Proposal.xlsx`
(+ internal plan). Rate $30/hr, **fixed price**.

WBS (internal, hours → cost):
| WBS | Phase | Hrs | Cost |
|---|---|---|---|
| 1.0 | Data audit & label-mining (Phase 0) | 5 | $150 |
| 2.0 | Schema + migration + backfill 20% (Phase 1) | 4 | $120 |
| 3.0 | Feature extraction incl. H3 density (Phase 2) | 5 | $150 |
| 4.0 | Train classifier + evaluation + serialize (Phase 3) | 7 | $210 |
| 5.0 | Inference job + cron wiring (Phase 4) | 5 | $150 |
| 6.0 | Review UI: score column/sort/filter + "Not a tower" + discard API (Phase 5) | 6 | $180 |
| 7.0 | End-to-end testing & validation (Phase 6) | 4 | $120 |
| | **Total** | **36** | **$1,080** |

Client-facing grouping (3 milestones):
- **A. Data foundation & model** (WBS 1-4): audit, schema, features, trained+evaluated model — 21 hrs / **$630**.
- **B. Automation & review tooling** (WBS 5-6): scoring job + ranked review UI + discard action — 11 hrs / **$330**.
- **C. Testing & handover** (WBS 7): end-to-end validation + short admin note — 4 hrs / **$120**.

**Proposed price to client: $1,080 fixed.**

Assumptions baked into the fixed price:
- Phase 0 finds enough usable negatives (target hundreds/class). If not, scope
  shifts to "ship the 'Not a tower' button + collect labels, train later" — a
  change order, not absorbed in the fixed price.
- Client confirms the heuristic that defines a "reviewed" lead.
- Single classifier over existing sources; new data sources / re-architecture excluded.
- Hosting/compute runs in the existing app (no per-record AI API cost — model is local JSON).
- Upsell levers: auto-discard tuning, periodic retraining service, satellite-image
  vision second-opinion, per-new-source feature work.

## Deliverables to produce on approval
1. `Tower_Lead_AI_Classifier_Client_Proposal.xlsx` in `cpd-courses/plans/` —
   styled to match the existing client proposal (blue headers `FF1F4E78`/`FF2E75B6`,
   yellow totals `FFFFF2CC`, Arial, `$#,##0`): "Project Overview" + "Milestones" sheets.
2. Save a copy of this plan as markdown in `cpd-courses/plans/` so it can be
   revisited after approval.

## Risks / notes
- Negative labels are mined heuristically — Phase 0 gate is mandatory; garbage
  negatives = garbage model. The "Not a tower" button is the long-term clean source.
- Keep it **rank + score only** (no auto-delete) per decision; revisit
  auto-discard of very-low scores only after metrics are trusted.
- `tags` JSON keys vary by source — `leadToFeatures` must tolerate missing keys.
