import { NextResponse } from 'next/server';
import axios from 'axios';

// Helper to parse WKT
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

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const lat = searchParams.get('lat');
    const lon = searchParams.get('lon');

    if (!lat || !lon) {
        return NextResponse.json({ error: 'Missing lat or lon parameter' }, { status: 400 });
    }

    const CLIENT_KEY = process.env.REPORTALL_API_KEY;

    if (!CLIENT_KEY) {
        console.error('[ERROR] REPORTALL_API_KEY not set');
        return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
    }

    try {
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
            const rawParcel = response.data.results[0];
            finalParcel = {
                ...rawParcel,
                geometry: parseWKT(rawParcel.geom_as_wkt)
            };
        }

        return NextResponse.json({ result: finalParcel });

    } catch (error) {
        console.error("API Error:", error.message);
        return NextResponse.json({
            error: 'Failed to fetch owner data',
            details: error.response?.data || error.message
        }, { status: error.response?.status || 500 });
    }
}
