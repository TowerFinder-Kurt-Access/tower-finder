import { NextResponse } from 'next/server';
import axios from 'axios';

// Reuse helper (could be moved to util file, keeping inline for speed)
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
    }
    // Simplification: only handling simple polygons for nearby parcels for now
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

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const lat = searchParams.get('lat');
    const lon = searchParams.get('lon');
    const radius = searchParams.get('radius');

    if (!lat || !lon) {
        return NextResponse.json({ error: 'Missing lat or lon parameter' }, { status: 400 });
    }

    const CLIENT_KEY = process.env.REPORTALL_API_KEY;

    if (!CLIENT_KEY) {
        return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
    }

    const radiusInDegrees = parseFloat(radius || 0.001);
    const latNum = parseFloat(lat);
    const lonNum = parseFloat(lon);

    const minLat = latNum - radiusInDegrees;
    const maxLat = latNum + radiusInDegrees;
    const minLon = lonNum - radiusInDegrees;
    const maxLon = lonNum + radiusInDegrees;

    const bboxWKT = `POLYGON((${minLon} ${minLat},${maxLon} ${minLat},${maxLon} ${maxLat},${minLon} ${maxLat},${minLon} ${minLat}))`;

    try {
        const response = await axios.get('https://reportallusa.com/api/parcels', {
            params: {
                client: CLIENT_KEY,
                v: 9,
                spatial_intersect: bboxWKT,
                si_srid: 4326,
                limit: 50
            },
            timeout: 60000
        });

        const parcels = [];
        if (response.data.results) {
            response.data.results.forEach(rawParcel => {
                parcels.push({
                    ...rawParcel,
                    geometry: parseWKT(rawParcel.geom_as_wkt)
                });
            });
        }

        return NextResponse.json({ parcels: parcels, count: parcels.length });

    } catch (error) {
        console.error("API Error:", error.message);
        return NextResponse.json({ error: 'Failed to fetch nearby parcels' }, { status: 500 });
    }
}
