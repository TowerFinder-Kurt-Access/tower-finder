# Restore: duplicate tower labels

How the duplicate-tower labeling works, how to undo it, and how to run it again.

## What the label means

`Duplicate Tower` marks a row that is the second copy of a site that is already in
the pool under another row. The keeper row keeps its own status, so the site stays
in the tower list, on the map, and in outreach.

The labeling script picks up the rows nobody has checked yet: towers with no
status, or with the machine-set status `New`, that share a Parcel address with
another tower in the same province and sit within `--max-separation` metres of it.

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

## Files

| File | Purpose |
|---|---|
| `scripts/migrations/label-duplicate-towers.ts` | the labeling run and the undo |
| `data/dupes/dupe-label-<timestamp>.json` | backup of every row the run changed |
| `data/dupes/far-apart-latest.json` | same-address groups the tolerance left alone, with row IDs and the distance between the closest two |

## The run of 2026-10-21

- Tolerance 25 m, every province.
- Labeled 3011 rows and gave the label back on 1032 rows that an earlier run had
  labelled on both sides of a pair.
- Wrote 4531 notes of the form `Duplicate of tower #<keeper id>`.
- Left 644 rows alone because a person had already given them a status.
- Held back 3077 addresses: same address, but the closest two towers are further
  apart than the tolerance.
- Backup: `data/dupes/dupe-label-2026-10-21T16-40-00-000Z.json`.
- A second run finds nothing to do. The run is idempotent.
- Nothing else changed. No note a person wrote was touched. No row was deleted.

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
| `--max-separation=25` | two towers on one address count as the same site within this many metres |
| `--write` | apply the change. Without it the script only prints |
| `--restore [file]` | undo. Newest backup unless a path follows |

## Safety notes

- The database is live. `POSTGRES_URL` points at the shared Prisma Postgres, and no
  staging copy exists. The backup file is the only way back.
- Every write run writes the backup **before** it changes anything, then stamps the
  post-write timestamps into the same file. A backup with `updatedAtAfter: null` came from
  an interrupted run. The undo then skips the timestamp check.
- `data/dupes/` is not in `.gitignore`. Commit the backup, or ignore it. Your call.
- The script never creates a status. `Duplicate Tower` must exist. It is id 16 today.
- Parcel addresses change when parcels are reprocessed. A group that was too wide
  can become a close pair later, and a close pair can drift apart. The run is a
  snapshot of the day it ran.

## Still open

- 3077 addresses hold two or more towers that share an address but sit further
  apart than 25 m. Address equality alone cannot judge those. A wider tolerance
  labels more, and risks labelling two real towers on one property.
- The map and the towers list still show every row, duplicates included. The
  `Status` filter isolates them.
- Rows a person gave a status to are never labelled, and a pair where one side was
  reviewed keeps the reviewed row and leaves the other side alone.
- 900 pairs still carry the label on both rows: a person set it on one side and
  the script set it on the other. The script never touches a status a person set.
