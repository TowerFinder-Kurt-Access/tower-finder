import { LocationNormalizationService } from '../src/services/LocationNormalizationService.ts';

async function testNormalization() {
    console.log('--- Testing Location Normalization ---');

    const testCases = [
        { city: 'New York', state: 'NY', country: 'USA' },
        { city: 'Los Angeles', state: 'California', country: 'USA' },
        { city: 'Toronto', state: 'Ontario', country: 'Canada' },
        { city: 'Vancouver', state: 'BC', country: 'Canada' }
    ];

    for (const testCase of testCases) {
        console.log(`Testing: ${testCase.city}, ${testCase.state}, ${testCase.country}`);
        try {
            const result = await LocationNormalizationService.getNormalizedData(testCase.city, testCase.state, testCase.country);
            if (result) {
                console.log('   Success:', JSON.stringify(result));
            } else {
                console.log('   Failed: No result returned');
            }
        } catch (error: any) {
            console.error('   Error:', error.message);
        }
        // Wait a bit if we hit Nominatim
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log('--- Test Complete ---');
}

testNormalization();
