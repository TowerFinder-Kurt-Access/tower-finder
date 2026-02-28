import { NRCanService } from './src/services/NRCanService';

async function testSingle() {
    const lat = 60.7212;
    const lng = -135.0568;
    console.log(`Testing NRCan for ${lat}, ${lng}...`);
    try {
        const feature = await NRCanService.fetchParcel(lat, lng);
        console.log('Result:', JSON.stringify(feature, null, 2));
    } catch (err) {
        console.error('Error:', err);
    }
}

testSingle();
