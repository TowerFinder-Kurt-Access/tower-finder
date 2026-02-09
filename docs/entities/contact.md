# Contact Entity

## Description
The **Contact** entity represents specific communication channels (Phone Numbers, Emails) found for an `Owner`. These are critical for the "Contacted" phase of the CRM workflow.

## Key Characteristics
- **Actionable:** These records are used directly for dialing or emailing.
- **Enrichment Source:** Usually acquired through "Skip Tracing" APIs or manual research after the Owner is identified.
- **Validation:** Includes status flags to indicate if the contact method is working.

## Schema Definition

| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | Int | Internal primary key. |
| `type` | String | Channel type: "Phone" or "Email". |
| `value` | String | The actual number or email address (e.g., "+1 555-0199", "jane@example.com"). |
| `label` | String? | Context for the contact (e.g., "Mobile", "Office", "Home", "Attorney"). |
| `isValid` | Boolean | Status flag. Default is `true`. Set to `false` if number is disconnected or email bounces. |

## Relationships
- **Owner:** Belongs to exactly one `Owner`.
    - `ownerId` (FK) -> `Owner`.

## Usage Context
- **Outreach:** Used by the mailing/calling modules to initiate contact.
- **Feedback Loop:** If a call fails, the `isValid` flag is toggled to prevent future waste.
