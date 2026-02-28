export class NRCanService {
    private static readonly BASE_URL = 'https://proxyinternet.nrcan-rncan.gc.ca/arcgis/rest/services/CLSS-SATC/ParcelService/MapServer/57/query';

    /**
     * Fetches the parcel data for a given latitude and longitude.
     * Returns the first feature found, or null if none.
     */
    static async fetchParcel(lat: number, lng: number): Promise<any> {
        const params = new URLSearchParams({
            geometry: `${lng},${lat}`,
            geometryType: 'esriGeometryPoint',
            spatialRel: 'esriSpatialRelIntersects',
            outFields: 'PIN,planNumber,parcelDesignator',
            returnGeometry: 'true',
            f: 'json',
            inSR: '4326',
        });

        const response = await fetch(`${this.BASE_URL}?${params.toString()}`);
        if (!response.ok) {
            throw new Error(`NRCan API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        return data.features?.[0] || null;
    }

    /**
     * Fetches nearby parcels within a given radius (meters) for a given latitude and longitude.
     * Returns an array of features.
     */
    static async fetchParcelsInRange(lat: number, lng: number, radiusMeters = 2000): Promise<any[]> {
        const params = new URLSearchParams({
            geometry: `${lng},${lat}`,
            geometryType: 'esriGeometryPoint',
            spatialRel: 'esriSpatialRelIntersects',
            distance: radiusMeters.toString(),
            units: 'esriSRUnit_Meter',
            outFields: 'PIN,planNumber,parcelDesignator',
            returnGeometry: 'true',
            f: 'json',
            inSR: '4326',
        });

        const response = await fetch(`${this.BASE_URL}?${params.toString()}`);
        if (!response.ok) {
            throw new Error(`NRCan API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        return data.features || [];
    }
}
