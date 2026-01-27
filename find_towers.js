const axios = require('axios');
const fs = require('fs');

async function findTowers() {
    console.log("Searching for towers...");

    // Smaller Bounding box for San Francisco (Downtown)
    // South, West, North, East
    const bbox = '37.77,-122.43,37.80,-122.39';

    // Overpass QL Query
    // We use [out:json] to get JSON response.
    // Increased timeout to 60 seconds
    const query = `
        [out:json][timeout:60];
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
        console.log("Sending query to Overpass API...");
        const response = await axios.post('https://overpass-api.de/api/interpreter', query, {
            headers: {
                'Content-Type': 'text/plain'
            },
            timeout: 60000 // Axios timeout 60s
        });

        const data = response.data;
        const elements = data.elements;

        const towers = [];

        if (!elements || elements.length === 0) {
            console.log("No towers found in this area.");
            return;
        }

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
                    type: element.tags?.man_made || 'unknown',
                    subType: element.tags?.['tower:type'] || '',
                    lat: lat,
                    lon: lon,
                    details: element.tags
                });
            }
        });

        const outputFilename = 'towers.json';
        fs.writeFileSync(outputFilename, JSON.stringify(towers, null, 2));

        console.log(`Found ${towers.length} towers/antennas.`);
        console.log(`Saved coordinates to ${outputFilename}`);

    } catch (error) {
        console.error("Error fetching data:", error.message);
        if (error.response) {
            console.error("API Status:", error.response.status);
            console.error("API Data:", error.response.data);
        }
    }
}

findTowers();
