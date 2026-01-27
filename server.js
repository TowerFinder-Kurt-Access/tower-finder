require('dotenv').config();
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

    // Get API key from environment variable
    const CLIENT_KEY = process.env.REPORTALL_API_KEY;

    if (!CLIENT_KEY) {
        console.error('[ERROR] REPORTALL_API_KEY not set in .env file');
        return res.status(500).json({ error: 'API key not configured. Please add REPORTALL_API_KEY to .env file' });
    }

    console.log(`[DEBUG] Fetching owner for Lat: ${lat}, Lon: ${lon}`);

    try {
        // Query ReportAll directly by coordinates using spatial_nearest
        console.log("[DEBUG] Querying ReportAll by coordinates...");
        const pointWKT = `POINT(${lon} ${lat})`;

        const response = await axios.get('https://reportallusa.com/api/parcels', {
            params: {
                client: CLIENT_KEY,
                v: 9,
                spatial_nearest: pointWKT,
                sn_srid: 4326,
                limit: 1
            },
            timeout: 60000
        });

        let finalParcel = null;

        if (response.data.results && response.data.results.length > 0) {
            console.log("[DEBUG] Found parcel via Spatial Query.");
            const rawParcel = response.data.results[0];
            finalParcel = {
                ...rawParcel,
                geometry: parseWKT(rawParcel.geom_as_wkt)
            };
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
        console.error("Error Code:", error.code);

        if (error.response) {
            console.error("API Response Status:", error.response.status);
            console.error("API Response Data:", error.response.data);
            return res.status(error.response.status).json({
                error: 'External API Error',
                details: error.response.data
            });
        }

        // Network/timeout errors
        if (error.code === 'ECONNABORTED' || error.message.includes('aborted')) {
            console.error("Request was aborted or timed out");
            return res.status(504).json({
                error: 'Request timeout - API did not respond in time',
                hint: 'ReportAllUSA only covers US parcels. Verify coordinates are in the United States.'
            });
        }

        res.status(500).json({
            error: 'Failed to fetch owner data',
            message: error.message
        });
    }
});

// API Endpoint to get Nearby Parcels
app.get('/api/nearby-parcels', async (req, res) => {
    const { lat, lon, radius } = req.query;

    if (!lat || !lon) {
        return res.status(400).json({ error: 'Missing lat or lon parameter' });
    }

    const CLIENT_KEY = process.env.REPORTALL_API_KEY;

    if (!CLIENT_KEY) {
        console.error('[ERROR] REPORTALL_API_KEY not set in .env file');
        return res.status(500).json({ error: 'API key not configured' });
    }

    // Default radius: 100 meters (approximate degrees)
    const radiusInDegrees = parseFloat(radius || 0.001); // ~100m at equator
    const latNum = parseFloat(lat);
    const lonNum = parseFloat(lon);

    // Create bounding box
    const minLat = latNum - radiusInDegrees;
    const maxLat = latNum + radiusInDegrees;
    const minLon = lonNum - radiusInDegrees;
    const maxLon = lonNum + radiusInDegrees;

    const bboxWKT = `POLYGON((${minLon} ${minLat},${maxLon} ${minLat},${maxLon} ${maxLat},${minLon} ${maxLat},${minLon} ${minLat}))`;

    console.log(`[DEBUG] Fetching nearby parcels around Lat: ${lat}, Lon: ${lon}, Radius: ${radiusInDegrees}`);

    try {
        const response = await axios.get('https://reportallusa.com/api/parcels', {
            params: {
                client: CLIENT_KEY,
                v: 9,
                spatial_intersect: bboxWKT,
                si_srid: 4326,
                limit: 50 // Get up to 50 nearby parcels
            },
            timeout: 60000
        });

        const parcels = [];

        if (response.data.results && response.data.results.length > 0) {
            console.log(`[DEBUG] Found ${response.data.results.length} nearby parcels`);
            response.data.results.forEach(rawParcel => {
                parcels.push({
                    ...rawParcel,
                    geometry: parseWKT(rawParcel.geom_as_wkt)
                });
            });
        }

        res.json({ parcels: parcels, count: parcels.length });

    } catch (error) {
        console.error("API Error:", error.message);
        if (error.response) {
            console.error("API Response:", error.response.data);
            return res.status(error.response.status).json({
                error: 'External API Error',
                details: error.response.data
            });
        }
        res.status(500).json({ error: 'Failed to fetch nearby parcels' });
    }
});

// API Endpoint to get Phone Number from Whitepages
app.get('/api/phone-lookup', async (req, res) => {
    const { name, address, city, state } = req.query;

    if (!name) {
        return res.status(400).json({ error: 'Missing name parameter' });
    }

    const WHITEPAGES_KEY = process.env.WHITEPAGES_API_KEY;

    if (!WHITEPAGES_KEY) {
        console.warn('[WARN] WHITEPAGES_API_KEY not set - skipping phone lookup');
        return res.json({ phone: null, note: 'Whitepages API key not configured' });
    }

    console.log(`[DEBUG] Looking up phone for: ${name}, ${city}, ${state}`);

    try {
        // Whitepages Pro API - Person endpoint
        const response = await axios.get('https://proapi.whitepages.com/3.1/person', {
            params: {
                api_key: WHITEPAGES_KEY,
                name: name,
                address_street: address || '',
                address_city: city || '',
                address_state_code: state || ''
            },
            timeout: 10000
        });

        if (response.data && response.data.results && response.data.results.length > 0) {
            const person = response.data.results[0];
            const phones = [];

            // Extract phone numbers
            if (person.phones && person.phones.length > 0) {
                person.phones.forEach(phone => {
                    if (phone.phone_number) {
                        phones.push({
                            number: phone.phone_number,
                            type: phone.line_type || 'unknown'
                        });
                    }
                });
            }

            console.log(`[DEBUG] Found ${phones.length} phone numbers`);
            res.json({ phones: phones, person: person });
        } else {
            console.log('[DEBUG] No phone results from Whitepages');
            res.json({ phones: [], person: null });
        }

    } catch (error) {
        console.error("Whitepages API Error:", error.message);
        if (error.response) {
            console.error("Whitepages Response:", error.response.data);
        }
        res.json({ phones: [], error: 'Phone lookup failed' });
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
