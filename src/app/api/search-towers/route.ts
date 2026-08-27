import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-helpers';
import { TowerSearchService } from '@/services/TowerSearchService';

export async function GET(request: Request) {
    try { await getAuthUser(); } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); }
    const { searchParams } = new URL(request.url);
    const north = searchParams.get('north');
    const south = searchParams.get('south');
    const east = searchParams.get('east');
    const west = searchParams.get('west');

    if (!north || !south || !east || !west) {
        return NextResponse.json({ error: 'Bounds (north, south, east, west) are required' }, { status: 400 });
    }

    try {
        const towers = await TowerSearchService.searchInBounds(
            parseFloat(north),
            parseFloat(south),
            parseFloat(east),
            parseFloat(west)
        );
        return NextResponse.json(towers);
    } catch (error) {
        console.error('Search failed:', error);
        return NextResponse.json({ error: 'Failed to search towers' }, { status: 500 });
    }
}
