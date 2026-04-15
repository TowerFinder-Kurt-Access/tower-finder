import axios from 'axios';
import { PrismaClient } from '@prisma/client';

/**
 * ArcGIS Rooftop Import Script
 *
 * Queries the HIFLD Cellular Towers ArcGIS REST API for all building-mounted
 * antennas across every US state and upserts them into the TowerLead table.
 *
 * Run from terminal:
 *   npx tsx scripts/import-arcgis-rooftops.ts
 *
 * Optional: target a single state:
 *   npx tsx scripts/import-arcgis-rooftops.ts --state CA
 */

const prisma = new PrismaClient();

const ARCGIS_CT_URL =
    'https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/Cellular_Towers_in_the_United_States/FeatureServer/0/query';

// FCC "B" prefix = building-mounted antenna
const BUILDING_TYPES = ['B', 'BANT', 'BMAST', 'BPIPE', 'BPOLE', 'BTWR'];
const TYPE_LIST = BUILDING_TYPES.map(t => `'${t}'`).join(',');
const PAGE_SIZE = 2000;

const US_STATES: { code: string; name: string }[] = [
    { code: 'AL', name: 'Alabama' },       { code: 'AK', name: 'Alaska' },
    { code: 'AZ', name: 'Arizona' },       { code: 'AR', name: 'Arkansas' },
    { code: 'CA', name: 'California' },    { code: 'CO', name: 'Colorado' },
    { code: 'CT', name: 'Connecticut' },   { code: 'DE', name: 'Delaware' },
    { code: 'FL', name: 'Florida' },       { code: 'GA', name: 'Georgia' },
    { code: 'HI', name: 'Hawaii' },        { code: 'ID', name: 'Idaho' },
    { code: 'IL', name: 'Illinois' },      { code: 'IN', name: 'Indiana' },
    { code: 'IA', name: 'Iowa' },          { code: 'KS', name: 'Kansas' },
    { code: 'KY', name: 'Kentucky' },      { code: 'LA', name: 'Louisiana' },
    { code: 'ME', name: 'Maine' },         { code: 'MD', name: 'Maryland' },
    { code: 'MA', name: 'Massachusetts' }, { code: 'MI', name: 'Michigan' },
    { code: 'MN', name: 'Minnesota' },     { code: 'MS', name: 'Mississippi' },
    { code: 'MO', name: 'Missouri' },      { code: 'MT', name: 'Montana' },
    { code: 'NE', name: 'Nebraska' },      { code: 'NV', name: 'Nevada' },
    { code: 'NH', name: 'New Hampshire' }, { code: 'NJ', name: 'New Jersey' },
    { code: 'NM', name: 'New Mexico' },    { code: 'NY', name: 'New York' },
    { code: 'NC', name: 'North Carolina' },{ code: 'ND', name: 'North Dakota' },
    { code: 'OH', name: 'Ohio' },          { code: 'OK', name: 'Oklahoma' },
    { code: 'OR', name: 'Oregon' },        { code: 'PA', name: 'Pennsylvania' },
    { code: 'RI', name: 'Rhode Island' },  { code: 'SC', name: 'South Carolina' },
    { code: 'SD', name: 'South Dakota' },  { code: 'TN', name: 'Tennessee' },
    { code: 'TX', name: 'Texas' },         { code: 'UT', name: 'Utah' },
    { code: 'VT', name: 'Vermont' },       { code: 'VA', name: 'Virginia' },
    { code: 'WA', name: 'Washington' },    { code: 'WV', name: 'West Virginia' },
    { code: 'WI', name: 'Wisconsin' },     { code: 'WY', name: 'Wyoming' },
    { code: 'DC', name: 'District of Columbia' },
];

async function fetchStateAntennas(stateCode: string): Promise<any[]> {
    const where = `LocState = '${stateCode}' AND StrucType IN (${TYPE_LIST})`;
    const all: any[] = [];
    let offset = 0;

    while (true) {
        const { data } = await axios.get(ARCGIS_CT_URL, {
            params: {
                where,
                outFields: 'Licensee,Callsign,StrucType,LocCity,LocCounty,LocState,LocAdd,latdec,londec',
                returnGeometry: false,
                resultRecordCount: PAGE_SIZE,
                resultOffset: offset,
                f: 'json',
            },
            timeout: 30000,
        });

        if (data.error) {
            throw new Error(`ArcGIS error: ${JSON.stringify(data.error)}`);
        }

        const features: any[] = data.features || [];
        all.push(...features);

        if (data.exceededTransferLimit && features.length === PAGE_SIZE) {
            offset += PAGE_SIZE;
            process.stdout.write(` [page ${offset / PAGE_SIZE + 1}]`);
        } else {
            break;
        }
    }

    return all;
}

async function upsertFeatures(features: any[], stateName: string): Promise<number> {
    let saved = 0;

    for (const f of features) {
        const a = f.attributes;
        if (!a.latdec || !a.londec) continue;

        await prisma.towerLead.upsert({
            where: {
                lat_lon_source: {
                    lat: a.latdec,
                    lon: a.londec,
                    source: 'ARCGIS_CT',
                },
            },
            update: {
                tags: a as any,
                updatedAt: new Date(),
            },
            create: {
                lat: a.latdec,
                lon: a.londec,
                source: 'ARCGIS_CT',
                sourceId: a.Callsign || null,
                type: 'rooftop',
                country: 'USA',
                province: stateName,
                city: a.LocCity || null,
                tags: a as any,
            },
        });

        saved++;
    }

    return saved;
}

async function main() {
    // Optional --state filter: npx tsx ... --state CA
    const stateArg = process.argv.find(a => a.startsWith('--state='))?.split('=')[1]
        || (process.argv.includes('--state') ? process.argv[process.argv.indexOf('--state') + 1] : null);

    const targets = stateArg
        ? US_STATES.filter(s => s.code === stateArg.toUpperCase())
        : US_STATES;

    if (targets.length === 0) {
        console.error(`Unknown state: ${stateArg}`);
        process.exit(1);
    }

    const startTime = Date.now();
    let totalSaved = 0;
    let totalFetched = 0;
    const errors: string[] = [];

    console.log(`\n🗼  ArcGIS Rooftop Import`);
    console.log(`   Source:  HIFLD Cellular Towers (FCC)`);
    console.log(`   Filter:  StrucType IN (${BUILDING_TYPES.join(', ')})`);
    console.log(`   States:  ${targets.length}`);
    console.log('─'.repeat(55));

    for (const { code, name } of targets) {
        process.stdout.write(`  ${code}  ${name.padEnd(25)}`);

        try {
            const features = await fetchStateAntennas(code);
            totalFetched += features.length;

            const saved = await upsertFeatures(features, name);
            totalSaved += saved;

            console.log(`${String(features.length).padStart(5)} found  →  ${String(saved).padStart(5)} saved`);
        } catch (err: any) {
            console.log(`  ❌ ERROR: ${err.message}`);
            errors.push(`${code}: ${err.message}`);
        }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('─'.repeat(55));
    console.log(`\n✅  Done in ${elapsed}s`);
    console.log(`   Fetched:  ${totalFetched} building-mounted antennas`);
    console.log(`   Saved:    ${totalSaved} TowerLeads (source=ARCGIS_CT)`);

    if (errors.length > 0) {
        console.log(`\n⚠️  ${errors.length} state(s) failed:`);
        errors.forEach(e => console.log(`   - ${e}`));
    }
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
