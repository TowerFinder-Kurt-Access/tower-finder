
import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-helpers';
import { TowerSearchService } from '@/services/TowerSearchService';

export async function GET(request: Request) {
    try { await getAuthUser(); } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); }
    const { searchParams } = new URL(request.url);
    const country = searchParams.get('country');
    const province = searchParams.get('province');
    const city = searchParams.get('city');

    if (!country) {
        return NextResponse.json({ error: 'Country is required' }, { status: 400 });
    }

    try {
        const bounds = await TowerSearchService.getBoundsForLocation(
            country,
            province || undefined,
            city || undefined
        );

        if (!bounds) {
            return NextResponse.json({ error: 'Location not found' }, { status: 404 });
        }

        return NextResponse.json(bounds);
    } catch (error) {
        console.error('Geocoding error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
