# Track Specification: Excel Export with Raw Data and Notes

## Overview
This track implements a feature to export tower data into an Excel (.xlsx) spreadsheet format. The export will include the original raw row data from the initial import concatenated with the latest system notes. This ensures a seamless loop for users who need to process tower data externally while retaining updates made within Tower Finder 4900.

## Functional Requirements
- **Export Trigger:** An "Export" button will be added to the Tower Table/Grid.
- **Export Scope:** Users can export:
    - All towers in the database.
    - Towers currently visible in the table after filtering/searching.
    - Specific towers selected via checkboxes in the table.
- **Data Content:**
    - **Raw Import Data:** The original, unaltered row data from the initial Excel import (e.g., "Mark's list" format).
    - **System Notes:** A new column named "System Notes" will be appended to the end of the raw data, containing all notes added to the tower within the application.
- **Data Persistence:**
    - The system must ensure that the raw row data from Excel imports is stored in the database for each tower.
- **Export Format:** The exported file must be an Excel spreadsheet (.xlsx).

## Non-Functional Requirements
- **Performance:** Exporting a large number of towers (e.g., several thousand) should be efficient and not block the UI.
- **Reliability:** The exported file must accurately reflect both the original import data and the current system notes.

## Acceptance Criteria
- [ ] An "Export" button is present on the Tower Table/Grid.
- [ ] Clicking "Export" generates and downloads an .xlsx file.
- [ ] The .xlsx file contains all expected columns from the original import.
- [ ] The .xlsx file includes a "System Notes" column with correctly concatenated notes.
- [ ] The export works correctly for "All", "Filtered", and "Selected" rows.
- [ ] New imports correctly store the raw row data in the database.
- [ ] Existing towers (if possible) are updated with their raw import data if available from previous import logs or files.
- [ ] Capability to re-import "Mark's list" to populate the raw data column for existing towers is verified and executed if needed.

## Out of Scope
- Exporting to other formats (e.g., CSV, PDF) in this initial phase.
- Customizable column selection for the export.
- Real-time sync back to the original source spreadsheets.
