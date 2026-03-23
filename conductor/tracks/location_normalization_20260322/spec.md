# Track Specification: Address and Location Data Normalization

## Overview
This track focuses on standardizing city, state/province, and county data across all tower records in both the USA and Canada. The goal is to move away from inconsistent string data to a normalized database structure, ensuring accurate filtering, searching, and display throughout the application.

## Functional Requirements
- **Normalized Schema:**
    - Introduce dedicated tables for `City`, `Province` (State), and `County`.
    - Update the `Parcel` model to reference these tables via foreign keys instead of storing raw strings.
- **Normalization Engine:**
    - Implement a service that takes raw address/location strings and maps them to the normalized tables.
    - **Service Choice:** Prioritize \"Free\" options such as **OpenStreetMap (Nominatim)** or local parsing logic.
- **Cron Job:**
    - Develop a background task that periodically scans for non-normalized records (where foreign keys are missing) and attempts to normalize them.
- **Manual Trigger:**
    - Add a \"Normalize Address\" button in the Tower Detail view to allow users to trigger the normalization for a specific record.
- **Consistent Display & Filtering:**
    - Ensure the Towers List table, Detail Views, and Data Exports use the normalized values.
    - **Filter Dropdowns:** Update all location-based filters (City, State, County) to pull distinct values from the normalized tables instead of raw strings.

## Non-Functional Requirements
- **Idempotency:** The normalization process should be safe to run multiple times on the same record.
- **Data Integrity:** Retain raw data in a `rawData` or `originalAddress` field.

## Acceptance Criteria
- [ ] Database schema is updated with `City`, `Province`, and `County` tables.
- [ ] Filter dropdowns in the UI display unique, standardized names from the new tables.
- [ ] Existing `Parcel` records are successfully migrated/linked to these new tables.
- [ ] A cron job is active and processing records in the background.
- [ ] UI reflects normalized data in all tables and detail views.
- [ ] Manual \"Normalize\" button is functional in the Tower Detail drawer/page.

## Out of Scope
- Real-time normalization during spreadsheet import.
- Correction of coordinates (lat/lon).
