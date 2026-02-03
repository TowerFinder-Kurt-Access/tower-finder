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

        // Return format to match previous API response structure
        // The service returns the internal DB Parcel model with owner included
        return NextResponse.json({
            result: {
                parcel_id: parcelData.parcelId,
                address: parcelData.address,
                city: parcelData.city,
                state: parcelData.state,
                zip: parcelData.zip,
                owner: parcelData.owner?.name || 'Unknown',
                mail_address: parcelData.owner?.address || '',
                data_source: parcelData.dataSource, // Which API provided this data
                // Include full objects for reference
                _parcel: parcelData,
                _owner: parcelData.owner,
                _rawData: parcelData.rawData // Raw API response for debugging
            }
        });

    } catch (error) {
        console.error("[API] Error fetching owner:", error);
        return NextResponse.json({
            error: 'Failed to fetch owner data',
            details: error.message
        }, { status: 500 });
    }
}
