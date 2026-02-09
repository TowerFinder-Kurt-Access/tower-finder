# Owner Entity

## Description
The **Owner** entity represents the legal entity or individual who holds the title to a `Parcel`. This is the primary target for outreach campaigns (direct mail, cold calling) in the Tower Finder system.

## Key Characteristics
- **Legal Owner:** Could be a private individual, an LLC, a Trust, or a Corporation.
- **Distinct from Property:** The owner has their own mailing address, which is often different from the physical parcel (property) address (especially in commercial real estate).

## Schema Definition

| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | Int | Internal primary key. |
| `name` | String | Legal name of the owner (e.g., "John Smith", "Acme Properties LLC"). |
| `type` | String? | Classification of the owner (e.g., "Individual", "LLC", "Trust", "Corp"). |
| `address` | String? | **Mailing Address** of the owner (where checks/bills go). |
| `createdAt` | DateTime | Timestamp of creation. |
| `updatedAt` | DateTime | Timestamp of last update. |

## Relationships
- **Parcels:** An Owner can own multiple `Parcels`.
    - One-to-Many relation with `Parcel`.
- **Contacts:** An Owner can have multiple `Contacts`.
    - One-to-Many relation with `Contact`.

## Usage Context
- **Deduplication:** The system aims to minimize duplicate owners so that one "Access Point" can manage multiple properties.
- **Import:** Owner data comes from the Parcel API (Assessor data) but is often enriched later.
