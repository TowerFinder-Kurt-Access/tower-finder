# Implementation Plan: Import Tower Data & Phone Management (USA)

## Phase 1: Data Model Updates
Extend the database schema to support multiple phone numbers and preserve raw Excel data.

- [ ] **Task: Define the 'Phone' Model in Prisma**
    - [ ] Add the `Phone` model to `prisma/schema.prisma` with fields: `number`, `status` (active/inactive/unknown), `rawValidationResult`, and a relation to the `Tower` model.
    - [ ] Update the `Tower` model to include a relation to multiple `Phone` records.
    - [ ] Add a `rawExcelData` (JSON) field to the `Tower` model.
    - [ ] Write a test case in a new or existing Prisma integration test file to verify the model relationship.
    - [ ] **CRITICAL:** Run `npx prisma generate` and `npx prisma db push` (or create a migration).
- [ ] **Task: Verify Data Model with Unit Tests**
    - [ ] Create a test file for the `Tower` and `Phone` models.
    - [ ] Write tests ensuring a `Tower` can have multiple `Phone` records and store raw JSON data.
    - [ ] Verify that the status of a `Phone` number can be updated.
- [ ] **Task: Conductor - User Manual Verification 'Data Model Updates' (Protocol in workflow.md)**

## Phase 2: Excel Import Script
Create a robust script to import US tower data from the Excel sheet, mapping key fields and handling multiple phone numbers.

- [ ] **Task: Develop the Excel Import Script**
    - [ ] Create a new script `scripts/import_marks_sheet.js`.
    - [ ] Implement logic to read "Marks Sheet new towers only 20260305.xlsx".
    - [ ] Map critical fields to `Tower`, `Owner`, and `Parcel` records.
    - [ ] Correctly handle rows with multiple phone number columns, creating `Phone` records for each.
    - [ ] Ensure towers are marked with source "markslist" and location context is set to USA.
    - [ ] Save the complete raw row from Excel into the `rawExcelData` field.
- [ ] **Task: Test Import Script with Sample Data**
    - [ ] Prepare a small sample of the Excel data for testing.
    - [ ] Write unit tests for the mapping logic.
    - [ ] Run the import script on the sample data and verify that `Tower` and `Phone` records are correctly created in the database.
- [ ] **Task: Conductor - User Manual Verification 'Excel Import Script' (Protocol in workflow.md)**

## Phase 3: Phone Validation Service & Job
Implement the scheduled task and API integration for automated phone number validation.

- [ ] **Task: Create Phone Validation Service**
    - [ ] Research and select a free phone validation API.
    - [ ] Create `src/services/PhoneValidationService.ts`.
    - [ ] Write tests for the service, mocking the API response.
    - [ ] Implement the validation logic, returning status and raw API output.
- [ ] **Task: Integrate Phone Validator into Job Queue**
    - [ ] Create a new job handler in `src/lib/job-handlers.ts`.
    - [ ] Write tests for the job handler, ensuring it correctly updates `Phone` status and results in the database.
    - [ ] Add the job to the existing scheduled task system (`src/lib/job-queue.ts`).
- [ ] **Task: End-to-End Test of Validation Workflow**
    - [ ] Manually trigger the validation job on a test `Phone` record.
    - [ ] Verify that the API is called and the database record is updated with the correct status and raw output.
- [ ] **Task: Conductor - User Manual Verification 'Phone Validation Service & Job' (Protocol in workflow.md)**
