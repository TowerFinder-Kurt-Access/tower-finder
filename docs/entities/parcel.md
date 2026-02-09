# Parcel Entity

## Description
The **Parcel** entity represents the legal plot of land (real estate) located at a `Tower`'s coordinates. This data is typically retrieved from County Assessor APIs (e.g., ReportAll, Regrid) during the research phase.

## Key Characteristics
- **Bridge Entity:** Connects the physical `Tower` to the legal `Owner`.
- **Dynamic Data:** Contains rich data about the property boundaries and tax address.
- **Verification:** Acts as proof that the "Tower" leads to a valid legal property.

## Schema Definition

| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | Int | Internal primary key. |
| `parcelId` | String? | Official APN (Assessor's Parcel Number) from the county. |
| `address` | String? | Physical street address of the land. |
| `city` | String? | City of the property. |
| `state` | String? | State of the property. |
| `zip` | String? | ZIP code of the property. |
| `geometry` | Json? | GeoJSON polygon data defining the property boundaries. Used for map visualization. |
| `dataSource` | String? | The API provider used to fetch this record (e.g., "ReportAll", "Regrid"). |
| `rawData` | Json? | Full, unmodified JSON response from the external API for debugging/audit purposes. |

## Relationships
- **Tower:** Belongs to exactly one `Tower`.
    - `towerId` (FK) -> `Tower`.
- **Owner:** Belong to exactly one `Owner` (in this simplified model).
    - `ownerId` (FK) -> `Owner`.

## Usage Context
- **Geocoding:** When a user clicks "Research", the system performs a spatial query using the Tower's coordinates to find this Parcel.
- **Visualization:** The `geometry` field is sent to the frontend to draw the property lines on the map.
