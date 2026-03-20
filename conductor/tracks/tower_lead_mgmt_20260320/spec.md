# Track Specification: Standardize Tower Lead and Activity Management Workflow

## Overview
This track aims to standardize how tower leads are handled, from initial identification through activity tracking and status progression to eventual promotion to a managed tower status.

## Goals
- **Centralize Lead Data:** Ensure all tower leads are tracked within the system.
- **Standardize Activity Logging:** Implement a uniform method for logging calls, notes, and other follow-up activities.
- **Lead Status Progression:** Create a clear status lifecycle for leads to improve pipeline visibility.

## User Stories
- **As a manager,** I want to see a clear list of all tower leads and their current status so I can monitor team activity.
- **As an operations user,** I want to log a call or note against a tower lead easily to keep a record of my interactions.
- **As an operations user,** I want to promote a tower lead to a managed tower status once a site is confirmed.

## Technical Requirements
- **Database:** Refine or define Prisma models for `TowerLead` and `Activity`.
- **API:** Implement robust CRUD API routes for lead management and activity logging.
- **UI:** Create a modern, interactive dashboard using MUI and React 19.
- **Validation:** Enforce status transition rules and data integrity at the database and API levels.
