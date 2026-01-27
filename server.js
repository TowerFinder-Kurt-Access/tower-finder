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

    // ReportAll API requires WKT (Well Known Text) format for points
    const pointWKT = `POINT(${lon} ${lat})`;

    try {
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

        const data = response.data;
        let finalParcel = null;

        if (data.results && data.results.length > 0) {
            // Take the first result
            const rawParcel = data.results[0];

            // Parse WKT to GeoJSON here on the server
            const geojson = parseWKT(rawParcel.geom_as_wkt);

            finalParcel = {
                ...rawParcel,
                geometry: geojson
            };

            console.log("Processed Parcel Owner:", finalParcel.owner || "Unknown");
        } else {
            console.log("No parcels found.");
        }

        // Send back the processed single parcel (or null)
        res.json({ result: finalParcel });

    } catch (error) {
        console.error("ReportAll API Error:", error.message);
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
