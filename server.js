const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const port = 3000;

// Serve static files (index.html, etc.)
app.use(express.static(path.join(__dirname)));

// API Endpoint to search for towers
app.get('/api/towers', async (req, res) => {
    const bbox = req.query.bbox; // Expected format: south,west,north,east

    if (!bbox) {
        return res.status(400).json({ error: 'Missing bbox parameter' });
    }

    console.log(`Searching for towers within: ${bbox}`);

    // Overpass QL Query
    const query = `
        [out:json][timeout:25];
        (
          node["man_made"="mast"](${bbox});
          way["man_made"="mast"](${bbox});
          relation["man_made"="mast"](${bbox});
          node["man_made"="tower"]["tower:type"="communication"](${bbox});
          way["man_made"="tower"]["tower:type"="communication"](${bbox});
          relation["man_made"="tower"]["tower:type"="communication"](${bbox});
        );
        out center;
    `;

    try {
        const response = await axios.post('https://overpass-api.de/api/interpreter', query, {
            headers: { 'Content-Type': 'text/plain' },
            timeout: 60000
        });

        const elements = response.data.elements;
        const towers = [];

        if (elements) {
            elements.forEach(element => {
                let lat, lon;
                if (element.lat && element.lon) {
                    lat = element.lat;
                    lon = element.lon;
                } else if (element.center) {
                    lat = element.center.lat;
                    lon = element.center.lon;
                }

                if (lat && lon) {
                    towers.push({
                        id: element.id,
                        type: element.tags?.man_made || 'unknown',
                        subType: element.tags?.['tower:type'] || '',
                        lat: lat,
                        lon: lon,
                        details: element.tags
                    });
                }
            });
        }

        console.log(`Found ${towers.length} towers.`);
        res.json(towers);

    } catch (error) {
        console.error("Overpass API Error:", error.message);
        res.status(500).json({ error: 'Failed to fetch data from OpenStreetMap' });
    }
});

// Helper to parse WKT (Moved from frontend)
function parseWKT(wkt) {
    if (!wkt) return null;
    wkt = wkt.trim().toUpperCase();

    const typeMatch = wkt.match(/^([A-Z]+)\s*\((.*)\)$/);
    if (!typeMatch) return null;
    const type = typeMatch[1];
    const content = typeMatch[2];

    if (type === 'POLYGON') {
        return {
            type: 'Polygon',
            coordinates: parsePoly(content)
        };
    } else if (type === 'MULTIPOLYGON') {
        const parts = content.split(/\)\)\s*,\s*\(\(/);
        const coordinates = parts.map(part => {
            let clean = part.replace(/^\(+/, '').replace(/\)+$/, '');
            return parsePoly('(' + clean + ')');
        });
        return {
            type: 'MultiPolygon',
            coordinates: coordinates
        };
    }
    return null;
}

function parsePoly(str) {
    const rings = str.match(/\(([^()]+)\)/g);
    if (!rings) return [];
    return rings.map(ring => {
        return ring.replace(/[()]/g, '').split(',').map(pair => {
            const [lon, lat] = pair.trim().split(/\s+/).map(Number);
            return [lon, lat];
        });
    });
}

// API Endpoint to get Land Owner (ReportAllUSA)
app.get('/api/owner', async (req, res) => {
    const { lat, lon } = req.query;

    if (!lat || !lon) {
        return res.status(400).json({ error: 'Missing lat or lon parameter' });
    }

    // Credentials provided by user
    // NOTE: 'QNEkJ8eGe8' is a DEMO key. It creates "Isles of Scilly" results for many US locations.
    const CLIENT_KEY = 'QNEkJ8eGe8';

    console.log(`[DEBUG] Fetching owner for Lat: ${lat}, Lon: ${lon}`);

    try {
        // Step 1: Reverse Geocode to get address (User requested flow)
        console.log("[DEBUG] Step 1: Reverse Geocoding via Nominatim...");
        const geoResponse = await axios.get('https://nominatim.openstreetmap.org/reverse', {
            params: {
                format: 'json',
                lat: lat,
                lon: lon,
                zoom: 18,
                addressdetails: 1
            },
            headers: { 'User-Agent': 'TowerFinderApp/1.0' }
        });

        const addressObj = geoResponse.data.address;
        let finalParcel = null;

        if (addressObj) {
            // Construct address query string for ReportAll
            // Try to make it as specific as possible: "House Number Street, City, State"
            const street = addressObj.road || '';
            const number = addressObj.house_number || '';
            const city = addressObj.city || addressObj.town || addressObj.village || '';
            const state = addressObj.state || '';
            const zip = addressObj.postcode || '';

            // We need at least a state/region to make a decent query, ideally street info
            if (street && state) {
                const addressQuery = `${number} ${street}, ${city}, ${state} ${zip}`.trim();
                console.log(`[DEBUG] Step 2: Querying ReportAll by Address: "${addressQuery}"`);

                const reportAllResponse = await axios.get('https://reportallusa.com/api/parcels', {
                    params: {
                        client: CLIENT_KEY,
                        v: 9,
                        q: addressQuery, // Address query
                        limit: 1
                    },
                    timeout: 60000
                });

                if (reportAllResponse.data.results && reportAllResponse.data.results.length > 0) {
                    console.log("[DEBUG] Found parcel via Address Query.");
                    const rawParcel = reportAllResponse.data.results[0];
                    finalParcel = {
                        ...rawParcel,
                        geometry: parseWKT(rawParcel.geom_as_wkt),
                        _method: 'address_query' // Debug info
                    };
                } else {
                    console.log("[DEBUG] No results from Address Query.");
                }
            } else {
                console.log("[DEBUG] Not enough address info for query (missing street or state).");
            }
        }

        // Step 3: Fallback to Spatial Query if Address Query failed
        if (!finalParcel) {
            console.log("[DEBUG] Fallback: Querying ReportAll by Spatial Point...");
            const pointWKT = `POINT(${lon} ${lat})`;

            const response = await axios.get('https://reportallusa.com/api/parcels', {
                params: {
                    client: CLIENT_KEY,
                    v: 9,
                    spatial_nearest: pointWKT,
                    si_srid: 4326,
                    limit: 1
                },
                timeout: 60000
            });

            if (response.data.results && response.data.results.length > 0) {
                console.log("[DEBUG] Found parcel via Spatial Query.");
                const rawParcel = response.data.results[0];
                finalParcel = {
                    ...rawParcel,
                    geometry: parseWKT(rawParcel.geom_as_wkt),
                    _method: 'spatial_fallback'
                };
            }
        }

        // Send Result
        if (finalParcel) {
            console.log("Processed Parcel Owner:", finalParcel.owner || "Unknown");
            res.json({ result: finalParcel });
        } else {
            console.log("No parcels found via any method.");
            res.json({ result: null });
        }

    } catch (error) {
        console.error("API Error:", error.message);
        if (error.response) {
            console.error("API Response Details:", error.response.data);
            return res.status(error.response.status).json({ error: 'External API Error', details: error.response.data });
        }
        res.status(500).json({ error: 'Failed to fetch owner data' });
    }
});

// API Endpoint to Geocode Location (Nominatim)
app.get('/api/geocode', async (req, res) => {
    const { q } = req.query;

    if (!q) {
        return res.status(400).json({ error: 'Missing query parameter q' });
    }

    console.log(`Geocoding query: ${q}`);

    try {
        const response = await axios.get('https://nominatim.openstreetmap.org/search', {
            params: {
                format: 'json',
                q: q
            },
            headers: {
                'User-Agent': 'TowerFinderApp/1.0' // Good practice for OSM API
            }
        });

        res.json(response.data);

    } catch (error) {
        console.error("Nominatim API Error:", error.message);
        res.status(500).json({ error: 'Failed to geocode location' });
    }
});

app.listen(port, () => {
    console.log(`Tower Finder App listening at http://localhost:${port}`);
});
