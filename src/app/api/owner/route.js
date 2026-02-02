import { NextResponse } from 'next/server';
import { InformationService } from '@/services/InformationService';

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const lat = searchParams.get('lat');
    const lon = searchParams.get('lon');

    if (!lat || !lon) {
        return NextResponse.json({ error: 'Missing lat or lon parameter' }, { status: 400 });
    }

    try {
        const latNum = parseFloat(lat);
        const lonNum = parseFloat(lon);

        // InformationService handles caching: check DB -> fetch API if missing -> save -> return
        const parcelData = await InformationService.getParcelAndOwner(latNum, lonNum);

        if (!parcelData) {
            return NextResponse.json({ result: null, message: 'No parcel data found' });
        }

        // Return format to match previous API response structure roughly
        // The service returns the internal DB Parcel model, we can return that directly
        return NextResponse.json({ result: parcelData });

    } catch (error) {
        console.error("[API] Error fetching owner:", error);
        return NextResponse.json({
            error: 'Failed to fetch owner data',
            details: error.message
        }, { status: 500 });
    }
}
