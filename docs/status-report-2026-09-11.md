# Tower Finder — Proposal Plan (2026-09-11)

Purpose: three open issues, explained in plain words, each with a proposed fix. Nothing here is built yet. The review form lives in a separate report: [docs/larry-form-report.md](larry-form-report.md).

Time basis: 1 day = 8 working hours.

## 1. Towers list: sorting and ID column

- Today: the towers list can only sort by 4 of its 15 columns. There is no ID column, so towers are hard to tell apart and hard to reference.
- Reported problem: the same rows (for example NO GSV entries) show up again when moving between pages, such as from page 41 to 42. Some rows may also be skipped without anyone noticing.
- Cause: when many rows share the same value in the sorted column, the system has no backup rule for ordering them. The order changes slightly each time the page loads, so pages overlap or skip.
- Proposal: add a visible ID column to the list and make it sortable. Add ID as the backup ordering rule behind every sort, so each row sits on exactly one page. Small change, no data changes needed.
- Estimated time: half a day (4 hrs, build plus page-by-page check).

## 2. Nearest landmark phone in More Details

- Today: each tower already has a list of nearby businesses with names, distances, and phone numbers where available. But nothing picks out the single nearest one with a phone, so staff must scan the list by hand.
- Map gap: the map marks nearby landmarks, but the tower itself has no clear pin. Staff sees landmark pins with no anchor showing where the tower stands, so "nearest" is hard to judge by eye.
- Accuracy problem: the nearest shown result is often a block away from the tower. Causes: the nearby search covers a wide circle (2 km) and keeps only 20 results, so the closest result with a phone can still be far; distances are taken as stored rather than rechecked against the tower; some tower locations are only approximate; non-shop landmarks are excluded.
- Proposal: pin the tower on the map with a clear distinct marker next to the landmark pin, so staff sees both points and the gap between them. For each tower, recheck true distances, look only inside a tight circle (about 500 m), and show one line at the top of More Details: nearest landmark name, its distance, and its phone. If nothing with a phone sits inside the circle, show that clearly instead of a far-away guess. If the best match is far, flag it so reviewers know. No data changes needed, no new paid services.
- Estimated time: 1 day (8 hrs, map pin, distance logic, visual check).

## 3. AI score accuracy (future work)

- Today: the system gives each unreviewed tower an AI score for ranking. Test results: it ranks better than chance but misses over half the real towers at the current cutoff. Fine for sorting, not for decisions.
- Biggest limiter is the training examples, not the method: "not a tower" examples were guessed from "No Street View" cases (which may only mean no street photos exist), and "tower" examples came from workflow stages (which mean "has an owner lead", not a confirmed tower). The hardest unclear cases were left out of training entirely.
- The score also uses only thin clues (nearby shop counts, tower density, rough location). It sees no height, structure type, photos, or notes.
- Proposed order: (a) hand-check about 200 examples against satellite view to measure the real error; (b) add a simple reviewer button ("is a tower / is not a tower") so future examples are reliable; (c) bring the unclear cases back into training; (d) add cheap new clues; (e) only then consider photos or bigger upgrades. Rule: never apply the tower score to leads (different countries, different mix).
- Estimated time: 2–3 days of review time (16–24 hrs) for step (a) — manual satellite checks, not coding. Steps (b)–(e) estimated after (a).

Total build time for items 1–2: about 1.5 days (12 hrs). Item 3 starts with review work, then re-estimate.

## Decisions needed

| # | Ask | Est. |
|---|---|---|
| 1 | Approve ID column plus backup ordering (fixes repeated rows across pages) | 4 hrs |
| 2 | Approve nearest-landmark-phone line with tight circle and shown distance | 8 hrs |
| 3 | Approve hand-check of examples as first AI step | 16–24 hrs review |

Review form: see [docs/larry-form-report.md](larry-form-report.md) (Est. TBD).
