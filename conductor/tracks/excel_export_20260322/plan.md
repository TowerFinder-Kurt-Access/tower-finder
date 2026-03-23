# Implementation Plan: Excel Export with Raw Data and Notes

## Phase 1: Data Model and Persistence Update [checkpoint: 6aee4bf]
- [x] Task: Update Prisma schema to include a `rawImportData` field (JSON or String) in the `Tower` model. [4b70811]
- [x] Task: Create and run a database migration to add the `rawImportData` field. [4b70811]
- [x] Task: Update the Excel import logic (e.g., `scripts/import_marks_sheet.ts`) to store the raw row data for each tower during import. [4b70811]
- [x] Task: Conductor - User Manual Verification 'Phase 1: Data Model and Persistence Update' (Protocol in workflow.md) [4b70811]

## Phase 2: Export Service and API Implementation [checkpoint: 02c8d86]
- [x] Task: Create a new service (e.g., `src/services/ExportService.ts`) to handle Excel generation using `xlsx` library. [0e84777]
- [x] Task: Implement logic in `ExportService` to fetch towers (with notes) and concatenate raw data with notes. [0e84777]
- [x] Task: Create a new API route (e.g., `/api/towers/export`) that accepts query parameters for "All", "Filtered", or "Selected" tower IDs and returns the Excel file. [0e84777]
- [x] Task: Write tests for the `ExportService` and the API route. [0e84777]
- [x] Task: Conductor - User Manual Verification 'Phase 2: Export Service and API Implementation' (Protocol in workflow.md) [0e84777]


## Phase 3: Frontend Integration
- [ ] Task: Update the `TowerTable` component to include checkboxes for row selection.
- [ ] Task: Add an "Export" button to the `TowerTable` (or a global position as previously discussed).
- [ ] Task: Implement the frontend logic to trigger the export API call with the correct parameters (all, filtered, or selected IDs).
- [ ] Task: Add a loading state and error handling for the export process.
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Frontend Integration' (Protocol in workflow.md)

## Phase 4: Data Migration and Final Verification
- [ ] Task: Create a one-time script to re-import "Mark's list" and populate the `rawImportData` column for existing towers.
- [ ] Task: Execute the migration script and verify data integrity.
- [ ] Task: Perform end-to-end testing of the export feature with various datasets.
- [ ] Task: Conductor - User Manual Verification 'Phase 4: Data Migration and Final Verification' (Protocol in workflow.md)
