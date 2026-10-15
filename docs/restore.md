# Restore: duplicate tower labels

How the duplicate-tower labeling works, how to undo it, and how to run it again.

## What the label means

`Duplicate Tower` means a human already checked that row. The labeling script picks up the
rows nobody has checked yet: towers with **no status** that share a Parcel address with
another tower in the same province.

It writes one field, `Tower.statusId`. It does not move notes, does not write owner or
parcel fields, does not create a tower, and does not delete anything.

Groups whose rows sit further apart than `--max-separation` (default 50 m) are left alone
and listed in a report instead. Two real towers on one property can share an address.

## Files

| File | Purpose |
|---|---|
| `scripts/migrations/label-duplicate-towers.ts` | the labeling run and the undo |
| `data/dupes/dupe-label-<timestamp>.json` | backup of every row the run changed |
| `data/dupes/far-apart-latest.json` | shared-address groups left unlabeled, with row IDs and distances |

## The run of 2026-10-15

- Labeled 419 rows in 218 addresses. Ontario 396, Alberta 23.
- Backup: `data/dupes/dupe-label-2026-10-15T01-33-20-507Z.json`.
- Held back: 4611 rows in 1812 addresses, because their rows sit more than 50 m apart.
  Ontario 3895, Alberta 716.
- Nothing else changed. No note was touched. No row was deleted. No owner or parcel field
  was written.

## Undo

```bash
# print what the undo would do
npx tsx --env-file=.env scripts/migrations/label-duplicate-towers.ts --restore

# undo it
npx tsx --env-file=.env scripts/migrations/label-duplicate-towers.ts --restore --write
```

- The undo reads the **newest** backup in `data/dupes/`. Pass a path after `--restore` to
  use a named one.
- The undo refuses a row when its status is no longer the label, or when the row was
  edited after the label. It prints every refusal. That protects work done in the app
  after the labeling run.
- It restores the status each row had before the run, which was empty for all 419 rows.

## Run it again

```bash
npx tsx --env-file=.env scripts/migrations/label-duplicate-towers.ts            # dry run, writes nothing
npx tsx --env-file=.env scripts/migrations/label-duplicate-towers.ts --write
```

A second run is safe. Rows that already carry the label are skipped.

## Flags

| Flag | Meaning |
|---|---|
| `--provinces=ON,AB` | provinces to scan. Default `ON,AB` |
| `--max-separation=50` | groups spread wider than this many metres are held back and reported |
| `--write` | apply the change. Without it the script only prints |
| `--restore [file]` | undo. Newest backup unless a path follows |

## Safety notes

- The database is live. `POSTGRES_URL` points at the shared Prisma Postgres, and no
  staging copy exists. The backup file is the only way back.
- Every write run writes the backup **before** it changes a row, then stamps the
  post-write timestamps into the same file. A backup with `updatedAtAfter: null` came from
  an interrupted run. The undo then skips the timestamp check.
- `data/dupes/` is not in `.gitignore`. Commit the backup, or ignore it. Your call.
- The script never creates a status. `Duplicate Tower` must exist. It is id 16 today.

## Still open

- 4611 rows share an address but sit more than 50 m apart. Address equality alone cannot
  judge those. Of the 1812 held-back addresses, 1265 hold rows more than 1.2 km apart,
  and most of those addresses carry no house number. Choose the tolerance with Arleen.
  `--max-separation=200` would add 292 rows. The 200 m to 500 m band adds 315 more.
- Quebec is untouched, with 3647 rows in shared-address groups, and it is not in the
  default province list.
