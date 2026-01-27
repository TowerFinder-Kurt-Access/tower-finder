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

// API Endpoint to get Land Owner (ReportAllUSA)
app.get('/api/owner', async (req, res) => {
    const { lat, lon } = req.query;

    if (!lat || !lon) {
        return res.status(400).json({ error: 'Missing lat or lon parameter' });
    }

    // Credentials provided by user
    const CLIENT_KEY = 'QNEkJ8eGe8';

    console.log(`Fetching owner for ${lat}, ${lon}...`);

    try {
        // ReportAll API requires WKT (Well Known Text) format for points
        // POINT(longitude latitude)
        const pointWKT = `POINT(${lon} ${lat})`;

        const response = await axios.get('https://reportallusa.com/api/parcels', {
            params: {
                client: CLIENT_KEY,
                v: 9, // API version
                spatial_nearest: pointWKT,
                si_srid: 4326,
                limit: 50 // Fetch many neighbors (approx 500m radius equivalent depending on density)
            },
            timeout: 10000
        });

        const data = response.data;

        let results = [];
        if (data.results && data.results.length > 0) {
            results = data.results;
        }

        console.log(`Found ${results.length} surrounding parcels.`);

        // Return full list for visualization
        res.json({ results });

    } catch (error) {
        console.error("ReportAll API Error:", error.message);
        if (error.response) {
            console.error("API Response:", error.response.data);
            return res.status(error.response.status).json({ error: 'External API Error', details: error.response.data });
        }
        res.status(500).json({ error: 'Failed to fetch owner data' });
    }
});

app.listen(port, () => {
    console.log(`Tower Finder App listening at http://localhost:${port}`);
});
