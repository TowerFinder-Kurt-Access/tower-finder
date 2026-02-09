# ReportAll API Query Documentation

## Issue Summary
Out of 31,010 locations queried, only 9 returned valid owner data. The remaining locations either return no results or return "UNKNOWN" as the owner name.

## API Endpoint
```
GET https://reportallusa.com/api/parcels
```

## Query Parameters
We use the `spatial_nearest` parameter to find the parcel closest to a given coordinate:

| Parameter | Value | Description |
|-----------|-------|-------------|
| `client` | `[YOUR_API_KEY]` | Client API key |
| `v` | `9` | API version |
| `spatial_nearest` | `POINT(lon lat)` | WKT format point geometry |
| `sn_srid` | `4326` | Spatial reference ID (WGS84) |
| `limit` | `1` | Return only the nearest parcel |

## Sample Request

### Example 1: Location with UNKNOWN Owner
```bash
GET https://reportallusa.com/api/parcels?client=[API_KEY]&v=9&spatial_nearest=POINT(-63.1311 46.2362)&sn_srid=4326&limit=1
```

**Expected Response:**
```json
{
  "results": [
    {
      "parcel_id": "123456",
      "address": "123 Main St",
      "city": "Charlottetown",
      "state": "PE",
      "zip": "C1A1A1",
      "owner": "[Owner Name Here]",
      "mail_address": "123 Mailing Address",
      "geom_as_wkt": "POLYGON(...)"
    }
  ]
}
```

**Actual Response (56 cases):**
```json
{
  "results": [
    {
      "parcel_id": "123456",
      "address": "123 Main St",
      "city": "Charlottetown",
      "state": "PE",
      "zip": "C1A1A1",
      "owner": "UNKNOWN",
      "mail_address": "",
      "geom_as_wkt": "POLYGON(...)"
    }
  ]
}
```

### Example 2: Location with No Results
```bash
GET https://reportallusa.com/api/parcels?client=[API_KEY]&v=9&spatial_nearest=POINT(-65.4321 45.9876)&sn_srid=4326&limit=1
```

**Actual Response (30,945 cases):**
```json
{
  "results": []
}
```

## Implementation Details

### How We Process the Response

1. **Parse Response**: Extract first result from `results` array
2. **Extract Owner Data**:
   - Owner name from `owner` field
   - Owner address from `mail_address` field
3. **Store in Database**: Save parcel and owner information

### Code Sample (TypeScript)
```typescript
const queryParams = {
  client: CLIENT_KEY,
  v: 9,
  spatial_nearest: `POINT(${lon} ${lat})`,
  sn_srid: 4326,
  limit: 1
};

const response = await axios.get('https://reportallusa.com/api/parcels', {
  params: queryParams,
  timeout: 60000
});

if (response.data.results && response.data.results.length > 0) {
  const result = response.data.results[0];
  const ownerName = result.owner || 'UNKNOWN';
  const ownerAddress = result.mail_address || '';
  // ... store in database
}
```

## Statistics

| Metric | Count | Percentage |
|--------|-------|------------|
| Total Locations Queried | 31,010 | 100% |
| Valid Owner Data Returned | 9 | 0.03% |
| "UNKNOWN" Owner Returned | 56 | 0.18% |
| No Results (Empty Array) | 30,945 | 99.79% |

## Attached Files

1. **locations_unknowns_for_support.json** - 56 locations where API returned parcel data but owner is "UNKNOWN"
2. **locations_export_for_support.json** - All 31,010 locations with complete data

## Questions for Support

1. Why does the API return "UNKNOWN" as the owner name for some parcels?
2. Are these locations outside your coverage area?
3. Is there a way to check coverage area before making API calls?
4. Are there specific states/provinces with limited data coverage?
5. Should we expect better results with different query parameters?

## Sample Coordinates from unknowns_for_support.json

Here are a few example coordinates that returned "UNKNOWN" owners:

- Location ID 1538: 46.2362, -63.1311
- Location ID 1821: 46.2353, -63.1287
- Location ID 3: 46.2389, -63.1283
- Location ID 23: 46.2381, -63.1269
- Location ID 5046: 46.2403, -63.1258

You can test these coordinates directly with your API to investigate the issue.
