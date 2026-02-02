import { NextResponse } from 'next/server';
import axios from 'axios';

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q');

    if (!q) {
        return NextResponse.json({ error: 'Missing query parameter q' }, { status: 400 });
    }

    try {
        const response = await axios.get('https://nominatim.openstreetmap.org/search', {
            params: {
                format: 'json',
                q: q
            },
            headers: {
                'User-Agent': 'TowerFinderApp/1.0'
            }
        });

        return NextResponse.json(response.data);

    } catch (error) {
        console.error("Nominatim API Error:", error.message);
        return NextResponse.json({ error: 'Failed to geocode location' }, { status: 500 });
    }
}
