# Restore: duplicate tower labels

How the duplicate-tower labeling works, how to undo it, and how to run it again.

Last verified: **2026-10-28**.

## Current status, 2026-10-28

- Rule: same address up to 1000 m. Different house numbers up to 25 m. Postal
  code is ignored when comparing streets.
- `9139` rows carry `Duplicate Tower`. A second run reports **Nothing to do**.
- `0` unlabeled same-address groups within 1000 m where no row has a human status.
- `0` unlabeled same-street pairs within 25 m where neither row has a human status.
- `895` same-address groups still have no duplicate label because at least one
  row has a human status. The status field cannot hold both labels. The script
  leaves human work alone.
- `63` same-address groups sit further than 1000 m apart. They stay unlabeled.
- `455` rows carry `Duplicate Tower` but have no `Duplicate of tower #...` note.
- Latest row backup: `data/dupes/dupe-label-2026-10-27T15-44-11-906Z.json`.
- Current full dump: `data/dupes/snapshots/tower-finder-current.dump`.

## What the label means

`Duplicate Tower` marks a row that is the second copy of a site that is already in
the pool under another row. The keeper row keeps its own status, so the site stays
in the tower list, on the map, and in outreach.

The labeling script picks up the rows nobody has checked yet: towers with no
status, or with the machine-set status `New`, that share a Parcel address with
another tower in the same province and sit within `--max-separation` metres of it.
Near house numbers and postal-code variants use the smaller 25 m rule.

It writes two things:

- `Tower.statusId` — the `Duplicate Tower` status.
- a note on the row: `Duplicate of tower #<keeper id>`.

It does not move notes a person wrote, does not write owner or parcel fields, does
not create a tower, and does not delete anything.

### Which row is the keeper

Every cluster of same-address towers within the tolerance keeps one row:

1. A row a person gave a status to wins (`Owner Found`, `No GSV`, `Could Not Find
   Owner (Calls)`, anything except `New` and `Duplicate Tower`).
2. Then the row with the most human work: notes, then assignments, then a human
   label, then an owner.
3. Then the lowest ID.

The notes this script writes do not count as human work, so the keeper does not
change from one run to the next.

The other rows in the cluster get the label, unless a person already gave them a
status. Those rows are reported and left alone.

Since 2026-10-27 the address match uses two distances. Same address: 1000 m.
Different house numbers: 25 m. `124, Main St` and `Main St` merge only when
they are within 25 m. Same-address towers further apart than 1000 m stay in
`far-apart-latest.json` and are not labeled.

## Files

| File | Purpose |
|---|---|
| `scripts/migrations/label-duplicate-towers.ts` | the labeling run and the undo |
| `data/dupes/dupe-label-<timestamp>.json` | backup of every row the run changed. Not in git: the repo is public and the file holds site addresses and the duplicate mapping. Copy it somewhere private before you need it |
| `data/dupes/snapshots/tower-finder-<timestamp>.dump` | full database dump. Not in git. Hold site addresses. Restore into a separate database first |
| `data/dupes/far-apart-latest.json` | same-address groups the tolerance left alone, with row IDs and the distance between the closest two |

## The run of 2026-10-27

- Tolerance 1000 m. The exact-address prefilter still limited this pass to rows
  whose own address string was already shared.
- Labeled 3294 rows.
- Repointed 286 notes, wrote 3922 notes, removed 2 notes from keepers.
- Left 1163 rows alone because a person had already given them a status.
- Held back 396 addresses: same address, but further apart than 1000 m.
- Backup: `data/dupes/dupe-label-2026-10-27T14-36-15-340Z.json`.
- A second run reports **Nothing to do** for this pass.
- Restore dry run can revert all 3294 rows with no skipped rows.
- Duplicate Tower count after this pass: 8948.

### Variant pass, 2026-10-27 15:08 (reverted)

The exact-address prefilter was removed, so leading-house-number variants could
reach the matcher. That rule was wrong and this pass was reverted.

- It labeled 2908 rows, including both `116` and `122, Rue du Couvent`.
- It also merged different house numbers on `Number 2 Road`, such as `8140`
  with `8280`.
- Reverted on 2026-10-27 15:24. 2820 rows gave the label back; 88 had already
  been restored by the rule cleanup. 2949 notes were deleted.
- Backup remains at `data/dupes/dupe-label-2026-10-27T15-08-26-017Z.json`.
  It is a record only. Do not restore it unless you want those labels back.

### Rule correction, 2026-10-27 15:19

The matcher grouped by street and ignored the house number. A keeper at `8280`
therefore swallowed `8140` and `8577` on the same street.

- The matcher no longer ignores the house number at any distance. Different
  house numbers merge only within 25 m.
- `5939` (`8140`) and `949` (`8577`) were restored to `New`.
- `7628` (`8140`) now points at `5939`. `1766` (`8577`) now points at `949`.
- The exact cleanup restored 104 keepers that a different house number had
  swallowed: 64 to no status, 40 to `New`.
- Repointed 168 notes, removed 114 notes from keepers.
- Backup: `data/dupes/dupe-label-2026-10-27T15-19-30-908Z.json`.
- A second run reports **Nothing to do**.
- Duplicate Tower count after this cleanup: 8930.

### Small-distance variant pass, 2026-10-27 15:28

- Same address: up to 1000 m. Different house numbers: only up to 25 m.
- Labeled 191 rows. Examples: `25294` (2315) to `20665` (2313), `25398`
  (2412) to `24008` (2414), and `28874` (375) to `25100` (392).
- Repointed 24 notes, wrote 248 notes.
- `8140` and `8280` stayed separate: they are 38 m apart.
- Backup: `data/dupes/dupe-label-2026-10-27T15-28-41-761Z.json`.
- A second run reports **Nothing to do**.
- Duplicate Tower count after this pass: 9121.

### Postal-code variant pass, 2026-10-27 15:44

- The street key now drops the postal code. Same street and point still merge
  when the postal code differs.
- Labeled 18 rows. Example: `38959` (793, Rue Saint-Louis) to `37915`
  (Rue Saint-Louis); 23 m apart.
- Repointed 13 notes, wrote 27 notes.
- Backup: `data/dupes/dupe-label-2026-10-27T15-44-11-906Z.json`.
- A second run reports **Nothing to do**.
- Current Duplicate Tower count: 9139.
- Audit: 0 unlabeled same-street pairs within 25 m with no human status.

To undo the remaining 14:36 pass, restore its backup. To undo the 104-row
cleanup, restore the 15:19 backup. To undo the 191-row variant pass, restore the
15:28 backup. To undo the postal pass, restore the 15:44 backup. Each restore
only rewinds its own run.

## The run of 2026-10-21

- Tolerance 25 m, every province.
- Labeled 3011 rows and gave the label back on 199 rows that an earlier run had
  labelled on both sides of a pair.
- Wrote 4531 notes of the form `Duplicate of tower #<keeper id>`.
- Left 644 rows alone because a person had already given them a status.
- Held back 3077 addresses: same address, but the closest two towers are further
  apart than the tolerance.
- Backup: `data/dupes/dupe-label-2026-10-21T17-24-00-764Z.json`.
- A second run finds nothing to do. The run is idempotent.
- Nothing else changed. No note a person wrote was touched. No row was deleted.

The undo was run on the live database and put every row back, then the run was
repeated and every row came back to the same value. The run and its undo are
exact inverses of each other.

The run before it, on 2026-10-15, is in
`data/dupes/dupe-label-2026-10-15T01-33-20-507Z.json`. It labelled 419 rows in 218
addresses and wrote no notes.

## Undo

```bash
# print what the undo would do
npx tsx --env-file=.env scripts/migrations/label-duplicate-towers.ts --restore

# undo it
npx tsx --env-file=.env scripts/migrations/label-duplicate-towers.ts --restore --write
```

- The undo reads the **newest** backup in `data/dupes/`. Pass a path after
  `--restore` to use a named one.
- The undo refuses a row when its status is no longer the label, or when the row
  was edited after the label. It prints every refusal. That protects work done in
  the app after the labeling run.
- The undo restores the status each row had before the run, deletes the notes the
  run wrote, and puts the label back on the rows the run took it away from.
- The undo took 14 seconds on the 2026-10-21 run.

## Run it again

```bash
npx tsx --env-file=.env scripts/migrations/label-duplicate-towers.ts            # dry run, writes nothing
npx tsx --env-file=.env scripts/migrations/label-duplicate-towers.ts --write
```

A second run is safe. Rows that already carry the label are skipped, a note that
already points at the keeper is not written twice, and a note left on a keeper is
removed.

## Flags

| Flag | Meaning |
|---|---|
| `--provinces=ON,AB` | provinces to scan. Default: every province |
| `--max-separation=1000` | two towers on one normalized address count as the same site within this many metres |
| `--write` | apply the change. Without it the script only prints |
| `--restore [file]` | undo. Newest backup unless a path follows |

## Safety notes

- The database is live. `POSTGRES_URL` points at the shared Prisma Postgres, and no
  staging copy exists. The backup file is the only way back.
- Every write run writes the backup **before** it changes anything, then stamps the
  post-write timestamps into the same file. A backup with `updatedAtAfter: null` came from
  an interrupted run. The undo then skips the timestamp check.
- `data/dupes/dupe-label-*.json` is in `.gitignore`. The repo is public, and a backup
  holds thousands of site addresses. Keep a copy outside the repo, on a private disk
  or bucket, before the run. The file on the machine that ran the script is not a backup.
- The script never creates a status. `Duplicate Tower` must exist. It is id 16 today.
- Parcel addresses change when parcels are reprocessed. A group that was too wide
  can become a close pair later, and a close pair can drift apart. The run is a
  snapshot of the day it ran.

## Still open

- `895` same-address groups have a human status on at least one row. They stay
  unlabeled unless duplicate becomes a separate field or the human status is
  overwritten.
- `63` same-address groups sit further apart than 1000 m. Address equality alone
  cannot judge those. A wider tolerance labels more, and risks labelling two real
  towers on one property.
- `455` `Duplicate Tower` rows have no keeper note. The status is set; the note is
  missing.
- The map and the towers list still show every row, duplicates included. The
  `Status` filter isolates them.
- Rows a person gave a status to are never labelled, and a pair where one side was
  reviewed keeps the reviewed row and leaves the other side alone.
