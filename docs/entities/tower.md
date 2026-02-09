# Tower Entity

## Description
The **Tower** entity is the starting point of the workflow. It represents a physical point of interest—typically a telecommunications structure (monopole, lattice tower, etc.) or a specific coordinate location (`lat`/`lon`) identified as a potential lead.

## Key Characteristics
- **Primary Identifier:** Uniquely identified by `id`, but enforced unique by the combination of `lat` and `lon`.
- **Source:** Can be imported from external datasets (FCC, Excel) or manually added.
- **Role:** Acts as the "Lead" or "Asset" in the CRM process.

## Schema Definition

| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | Int | Internal primary key. |
| `lat` | Float | Latitude of the structure. |
| `lon` | Float | Longitude of the structure. |
| `type` | String? | Structure description (e.g., "Monopole", "Lattice"). |
| `status` | String | CRM Status (e.g., "New", "Researched", "Contacted"). Default: "Unknown". |
| `licensee` | String? | The entity operating the tower hardware (e.g., American Tower), NOT necessarily the land owner. |
| `googleMapsUrl` | String? | Helper link to view location on Google Maps. |
| `source` | String | Origin of the data (e.g., "Excel Import", "Tower Finder"). |
| `createdAt` | DateTime | Timestamp of creation. |
| `updatedAt` | DateTime | Timestamp of last update. |

## Relationships
- **Parcel:** A Tower sits on exactly one (or zero if not researched) `Parcel`.
    - `Tower` has a one-to-one (optional) relation with `Parcel`.

## Usage Context
1. **Import:** Towers are often imported in bulk via Excel or CSV.
2. **Research:** The `lat`/`lon` of the Tower is used to query external APIs (like ReportAll) to find the underlying Parcel.
3. **CRM:** The `status` field tracks the sales pipeline stage for this specific asset.
