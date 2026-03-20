# Implementation Plan: Standardize Tower Lead and Activity Management Workflow

## Phase 1: Data Model & API Foundation
Establish the core data models and API endpoints required for lead and activity management.

- [ ] **Task: Define/Refine Prisma Models for TowerLeads and Activities**
    - [ ] Create/Update `TowerLead` model in `schema.prisma` with appropriate fields (status, location, details).
    - [ ] Create/Update `Activity` model in `schema.prisma` to track calls, notes, and status changes.
    - [ ] Run Prisma generate and push changes to the database.
- [ ] **Task: Implement CRUD API Routes for TowerLeads**
    - [ ] Write tests for TowerLead API endpoints (GET, POST, PATCH).
    - [ ] Implement Next.js API routes for managing tower leads.
    - [ ] Verify functionality and test coverage (>80%).
- [ ] **Task: Implement API Routes for Activity Logging**
    - [ ] Write tests for Activity API endpoints.
    - [ ] Implement Next.js API routes for logging activities against tower leads.
    - [ ] Verify functionality and test coverage.
- [ ] **Task: Conductor - User Manual Verification 'Data Model & API Foundation' (Protocol in workflow.md)**

## Phase 2: Lead Management UI
Create the frontend interface for searching, viewing, and managing tower leads and their associated activities.

- [ ] **Task: Create TowerLead Table/List View**
    - [ ] Write unit tests for the TowerLead list component.
    - [ ] Implement a filterable MUI Data Grid for tower leads, including status and location filters.
    - [ ] Connect the UI to the TowerLead API.
- [ ] **Task: Implement Lead Detail View with Activity History**
    - [ ] Write unit tests for the Lead Detail component.
    - [ ] Create a detailed view showing lead information and a chronological list of activities.
    - [ ] Ensure the UI is responsive and follows the project guidelines.
- [ ] **Task: Implement "Log Activity" Dialog**
    - [ ] Write tests for the activity logging form.
    - [ ] Create a dialog/form for users to quickly log calls, notes, or status updates.
    - [ ] Verify seamless integration with the Activity API.
- [ ] **Task: Conductor - User Manual Verification 'Lead Management UI' (Protocol in workflow.md)**

## Phase 3: Promotion Workflow & Status Transitions
Implement the business logic and UI for promoting leads and ensuring data integrity during status changes.

- [ ] **Task: Implement "Promote to Tower" Logic and UI**
    - [ ] Write tests for the lead promotion workflow.
    - [ ] Implement a "Promote to Tower" action that creates a permanent `Tower` record and updates the lead status.
    - [ ] Add necessary UI feedback and error handling for the promotion process.
- [ ] **Task: Add Validation for Status Transitions**
    - [ ] Write unit tests for status transition rules.
    - [ ] Implement backend and frontend validation to ensure leads follow a valid status lifecycle.
- [ ] **Task: Final UI Polish and Mobile Check**
    - [ ] Perform a comprehensive review of the new UI against the `product-guidelines.md`.
    - [ ] Verify the responsive layout on mobile devices.
    - [ ] Fix any remaining style or UX issues.
- [ ] **Task: Conductor - User Manual Verification 'Promotion Workflow & Status Transitions' (Protocol in workflow.md)**
