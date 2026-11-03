import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-helpers';

// Free BC ParcelMap open service. No key or account, so the lookup stays server side.
const BC_PARCEL_LAYER =
    'https://delivery.maps.gov.bc.ca/arcgis/rest/services/whse/bcgw_pub_whse_cadastre/MapServer/1/query';

// Roughly 65 m each way. A point query misses parcels that straddle the point.
const PAD_DEGREES = 0.0006;

interface BcParcelResponse {
    features?: { attributes?: Record<string, unknown> }[];
}

export async function GET(request: Request) {
    try {
        await getAuthUser();
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const lat = Number(searchParams.get('lat'));
    const lon = Number(searchParams.get('lon'));

    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
        return NextResponse.json({ error: 'Valid lat and lon are required' }, { status: 400 });
    }

    const envelope = [lon - PAD_DEGREES, lat - PAD_DEGREES, lon + PAD_DEGREES, lat + PAD_DEGREES].join(',');
    const url = `${BC_PARCEL_LAYER}?f=json&geometry=${envelope}`
        + '&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelEnvelopeIntersects'
        + '&outFields=PID,PARCEL_NAME,OWNER_TYPE,MUNICIPALITY,PLAN_NUMBER,FEATURE_AREA_SQM&returnGeometry=false'
        + '&resultRecordCount=1';

    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) {
            return NextResponse.json({ error: 'Parcel service unavailable' }, { status: 502 });
        }

        const data = (await res.json()) as BcParcelResponse;
        const attributes = data.features?.[0]?.attributes;

        if (!attributes) {
            return NextResponse.json({ parcel: null });
        }

        return NextResponse.json({
            parcel: {
                pid: attributes.PID ?? null,
                parcelName: attributes.PARCEL_NAME ?? null,
                ownerType: attributes.OWNER_TYPE ?? null,
                municipality: attributes.MUNICIPALITY ?? null,
                planNumber: attributes.PLAN_NUMBER ?? null,
                areaSqm: attributes.FEATURE_AREA_SQM ?? null,
            },
        });
    } catch (error) {
        console.error('[API] BC parcel lookup failed:', error);
        return NextResponse.json({ error: 'Parcel service unavailable' }, { status: 502 });
    }
}
