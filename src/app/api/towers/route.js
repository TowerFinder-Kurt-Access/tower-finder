import { NextResponse } from 'next/server';
import axios from 'axios';

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const bbox = searchParams.get('bbox'); // south,west,north,east

    if (!bbox) {
        return NextResponse.json({ error: 'Missing bbox parameter' }, { status: 400 });
    }

    console.log(`Searching for towers within: ${bbox}`);

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

        return NextResponse.json(towers);

    } catch (error) {
        console.error("Overpass API Error:", error.message);
        return NextResponse.json({ error: 'Failed to fetch data from OpenStreetMap' }, { status: 500 });
    }
}
