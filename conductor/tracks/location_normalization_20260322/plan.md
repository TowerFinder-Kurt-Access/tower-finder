# Implementation Plan: Address and Location Data Normalization

## Phase 1: Database Schema and Migration [checkpoint: 3c50b91]
- [x] Task: Update Prisma schema to add `City`, `Province`, and `County` models.
- [x] Task: Add foreign key relations to the `Parcel` model (`cityId`, `provinceId`, `countyId`).
- [x] Task: Create and run a migration to update the database.
- [x] Task: Conductor - User Manual Verification 'Phase 1: Database Schema and Migration' (Protocol in workflow.md)

## Phase 2: Normalization Service and Logic [checkpoint: 854ea06]
- [x] Task: Implement `LocationNormalizationService` using OpenStreetMap (Nominatim) or similar free parsing logic.
- [x] Task: Write unit tests for the normalization logic (handling USA and Canada patterns).
- [x] Task: Implement logic to upsert `City`, `Province`, and `County` records during normalization.
- [x] Task: Conductor - User Manual Verification 'Phase 2: Normalization Service and Logic' (Protocol in workflow.md)

## Phase 3: Background Processing (Internal Job Queue) [checkpoint: c5e69e1]
- [x] Task: Implement a new job handler `normalize_locations` in `src/lib/jobs/normalization.ts`.
- [x] Task: Register the `normalize_locations` handler in `src/lib/job-handlers.ts`.
- [x] Task: Implement the batch processing logic within the handler (process X records per job run).
- [x] Task: Create a trigger API route (e.g., `/api/cron/trigger-normalization`) to enqueue the initial normalization job.
- [x] Task: Conductor - User Manual Verification 'Phase 3: Background Processing' (Protocol in workflow.md)

## Phase 4: UI and API Updates [checkpoint: 2ce4024]
- [x] Task: Update the Tower Detail view to display normalized names and include the manual \"Normalize\" button (triggers a manual job or immediate call).
- [x] Task: Update the main Towers API to include the normalized relations in responses.
- [x] Task: Update the filter options API to fetch unique names from the normalized tables.
- [x] Task: Update the Towers List table columns to use the new relation fields.
- [x] Task: Conductor - User Manual Verification 'Phase 4: UI and API Updates' (Protocol in workflow.md)

## Phase 5: Final Migration and Cleanup
- [x] Task: Run the normalization jobs on the full dataset to backfill existing records.
- [x] Task: Verify that all filter dropdowns across the app show standardized values.
- [x] Task: Conductor - User Manual Verification 'Phase 5: Final Migration and Cleanup' (Protocol in workflow.md)
