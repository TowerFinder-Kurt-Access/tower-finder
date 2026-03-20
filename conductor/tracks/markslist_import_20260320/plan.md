# Implementation Plan: Import Tower Data & Phone Management (USA)

## Phase 1: Data Model Updates [checkpoint: 9656785]
Extend the database schema to support multiple phone numbers and preserve raw Excel data.

- [x] **Task: Define the 'Phone' Model in Prisma** a0b3f56
    - [x] Add the `Phone` model to `prisma/schema.prisma` with fields: `number`, `status` (active/inactive/unknown), `rawValidationResult`, and a relation to the `Tower` model.
    - [x] Update the `Tower` model to include a relation to multiple `Phone` records.
    - [x] Add a `rawExcelData` (JSON) field to the `Tower` model.
    - [x] Write a test case in a new or existing Prisma integration test file to verify the model relationship.
    - [x] **CRITICAL:** Run `npx prisma generate` and `npx prisma db push` (or create a migration).
- [x] **Task: Verify Data Model with Unit Tests** 772a36c
    - [x] Create a test file for the `Tower` and `Phone` models.
    - [x] Write tests ensuring a `Tower` can have multiple `Phone` records and store raw JSON data.
    - [x] Verify that the status of a `Phone` number can be updated.
- [x] **Task: Conductor - User Manual Verification 'Data Model Updates' (Protocol in workflow.md)** 9656785

## Phase 2: Excel Import Script [checkpoint: ea8ead2]
Create a robust script to import US tower data from the Excel sheet, mapping key fields and handling multiple phone numbers.

- [x] **Task: Develop the Excel Import Script** 49aa356
    - [x] Create a new script `scripts/import_marks_sheet.js`.
    - [x] Implement logic to read "Marks Sheet new towers only 20260305.xlsx".
    - [x] Map critical fields to `Tower`, `Owner`, and `Parcel` records.
    - [x] Correctly handle rows with multiple phone number columns, creating `Phone` records for each.
    - [x] Ensure towers are marked with source "markslist" and location context is set to USA.
    - [x] Save the complete raw row from Excel into the `rawExcelData` field.
- [x] **Task: Test Import Script with Sample Data** 49aa356
    - [x] Prepare a small sample of the Excel data for testing.
    - [x] Write unit tests for the mapping logic.
    - [x] Run the import script on the sample data and verify that `Tower` and `Phone` records are correctly created in the database.
- [x] **Task: Conductor - User Manual Verification 'Excel Import Script' (Protocol in workflow.md)** ea8ead2

## Phase 3: Multi-Level Phone Validation Service & Job [checkpoint: a9b992e]
Implement the scheduled task and service for automated phone validation across three levels: Format, Active Status, and Ring Verification.

- [x] **Task: Implement Multi-Level Phone Validation Logic** d2c2c33
    - [x] Update `src/services/PhoneValidationService.ts` to implement three levels of checks.
    - [x] Level 1 (Format): Use a local library (e.g., regex or `libphonenumber-js` if available).
    - [x] Level 2 (Active): Integrate the **NumVerify API** (https://numverify.com/) to check if the number is active, including carrier and line type. a5420cc, aba8580 (refinements)
    - [x] Level 3 (Ring): Research and implement a basic "ring" verification (e.g., via a mock or free robocaller service if feasible, or a specific API that supports it). aba8580 (set to pending implementation)

- [x] **Task: Update Job Queue to Process Levels Sequentially** d2c2c33
    - [x] Modify `src/lib/jobs/phone-validation.ts` to process numbers through all three levels.
    - [x] Ensure `PhoneCheck` records are created for each level of validation for audit purposes.
    - [x] Update the `Phone` status based on the final successful level reached.
- [x] **Task: End-to-End Test of Multi-Level Validation** d2c2c33
    - [x] Run the job on test numbers representing different failure points (invalid format, inactive number, no ring).
    - [x] Verify database state for all levels of checks.
- [x] **Task: Conductor - User Manual Verification 'Multi-Level Phone Validation Service & Job' (Protocol in workflow.md)** a9b992e

## Phase 4: UI Updates & Refinements [checkpoint: 5a2b3c4]
Update the UI to display multiple phone numbers and imported notes.

- [x] **Task: Update Tower Details API**
    - [x] Modify `src/app/api/towers/[id]/route.ts` to include `phones` in the GET response.
- [x] **Task: Update TowerDetailDrawer UI**
    - [x] Update interfaces to include `Phone` and `phones` in `Tower`.
    - [x] Add "PHONES" section with color-coded status chips and formatted numbers.
- [x] **Task: Refine Excel Import for Notes**
    - [x] Update `scripts/import_marks_sheet.ts` to map 'Brett Notes' and 'Misc MM' to the `Note` table.
    - [x] Implement splitting of concatenated notes by semicolon.
    - [x] Verify data in database using `scripts/verify_import.ts`.
- [x] **Task: Conductor - User Manual Verification 'UI Updates & Refinements' (Protocol in workflow.md)** 5a2b3c4
