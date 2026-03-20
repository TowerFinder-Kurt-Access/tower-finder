# Product Guidelines: Tower Finder 4900

## Prose & Tone
- **Professional & Direct:** All user-facing text should be professional, concise, and focused on providing clear information.
- **Action-Oriented:** Use active voice when providing instructions or feedback (e.g., "Search for a tower," "View owner details").
- **Consistent Terminology:** Consistently use "Tower," "Owner," "Parcel," and "Lead" throughout the UI.

## Branding & Visual Identity
- **Modern & Professional:** Leverage a modern aesthetic using the Material-UI (MUI) design language.
- **Color Palette:** Use a primary palette that suggests trust and reliability (e.g., professional blues or corporate grays), with clear status indicators for tower states (e.g., green for active, amber for pending).
- **Iconography:** Use standard, intuitive icons (e.g., MUI Icons) for common actions like searching, editing, and deleting.

## UX Principles
- **Map-Centric Interface:** Prioritize the interactive map as the primary method of navigation and discovery.
- **Responsive Dashboard:** Ensure a seamless transition between the sidebar/navigation and the main content area (map or tables).
- **Efficiency First:** Design for power users who need to perform repetitive tasks (searching, note-taking) with minimal friction.
- **Clear Feedback:** Provide immediate visual feedback for all user actions (e.g., loading states, success notifications, error messages).

## Data Integrity
- **Validation:** Implement robust field validation for all user inputs (e.g., tower coordinates, phone numbers, email addresses).
- **Privacy First:** Ensure sensitive owner and lead information is only accessible to authorized users.
