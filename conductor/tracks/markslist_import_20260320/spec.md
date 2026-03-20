# Track Specification: Import Tower Data & Phone Management (USA)

## Overview
This track focuses on importing tower data from "Marks Sheet new towers only 20260305.xlsx," mapping relevant US tower data to our current system, and extending our data model to support multiple phone numbers per tower with status tracking and automated validation.

## Goals
- **Import US Tower Data:** Correctly map and import towers from the provided Excel sheet, marking them with the source "markslist."
- **Support Multiple Phone Numbers:** Transition from single phone numbers to a dedicated "Phone" table associated with towers.
- **Automated Phone Validation:** Implement a scheduled task using an existing job queue pattern to validate phone numbers using a free API and store results.
- **Preserve Raw Data:** Save the complete raw row from the Excel sheet into the tower record for future reference.

## Functional Requirements
- **Excel Data Import:**
    - Source: "Marks Sheet new towers only 20260305.xlsx".
    - Filter and map critical fields to the existing tower, owner, and parcel models.
    - Save the original raw data row in a JSON field for each tower record.
- **Phone Number Management:**
    - Create a `Phone` table with fields for number, status (active/inactive/unknown), and raw validation output.
    - Allow each tower to have one or more associated phone numbers.
- **Validation Scheduled Task:**
    - Use the existing job system to process phone numbers in the `Phone` table.
    - Integrate with a free phone validation API (e.g., Numverify or similar).
    - Update phone status and store raw API output in the database.

## Technical Requirements
- **Database:** Define or update Prisma models for `Phone` and potentially `Tower` (to add a JSON raw data field).
- **Scheduled Jobs:** Extend `src/lib/job-handlers.ts` and related queue logic for the phone validator.
- **Import Tooling:** Create or update an import script (e.g., in `scripts/`) to handle the Excel sheet and its multiple phone columns.

## Acceptance Criteria
- [ ] Towers from the Excel sheet are successfully imported with "markslist" as the source.
- [ ] Multiple phone numbers per tower are correctly stored in the new `Phone` table.
- [ ] Raw Excel row data is accessible for each imported tower.
- [ ] A scheduled task runs and successfully validates phone numbers via a free API, updating their status and storing the raw result.
- [ ] Validation status (active/inactive) is correctly reflected in the system.

## Out of Scope
- Detailed UI for managing multiple phone numbers (initial focus is data import and automated validation).
- Paid phone validation services.
