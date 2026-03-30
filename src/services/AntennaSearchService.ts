import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as fs from 'fs';

// Add the stealth plugin
chromium.use(StealthPlugin());

/**
 * AntennaSearchService
 * Scrapes registration data from antennasearch.com using Playwright
 */
export class AntennaSearchService {
    private static readonly HOME_URL = 'https://www.antennasearch.com/';
    private static readonly BASE_URL = 'https://www.antennasearch.com/HTML/search/search.php';

    /**
     * Fetches antenna records near a given coordinate.
     * @param lat Latitude
     * @param lon Longitude
     * @returns Array of antenna records
     */
    static async fetchAntennas(lat: number, lon: number): Promise<any[]> {
        // Dedicated session folder (doesn't interfere with your main Chrome)
        const userDataDir = './discovery_session_antennas';
        
        const context = await chromium.launchPersistentContext(userDataDir, {
            headless: false,
            args: [
                '--disable-blink-features=AutomationControlled',
                '--no-sandbox'
            ],
            viewport: { width: 1280, height: 720 },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        });

        const page = context.pages()[0] || await context.newPage();
        const results: any[] = [];

        // Helper for human-like typing
        const typeLikeHuman = async (selector: string, text: string) => {
            const element = page.locator(selector);
            await element.scrollIntoViewIfNeeded();
            const box = await element.boundingBox();
            if (box) {
                await page.mouse.move(
                    box.x + box.width / 2 + (Math.random() * 10 - 5), 
                    box.y + box.height / 2 + (Math.random() * 10 - 5), 
                    { steps: 10 }
                );
                await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
            }
            await page.waitForTimeout(500 + Math.random() * 1000);
            for (const char of text) {
                await page.keyboard.type(char, { delay: 100 + Math.random() * 150 });
            }
        };

        try {
            // 1. Land on the Home Page
            console.log(`[AntennaSearch] Landing on home page...`);
            await page.goto(this.HOME_URL, { waitUntil: 'networkidle', timeout: 60000 });
            
            console.log('[AntennaSearch] Waiting 10s for you to solve any initial CAPTCHA...');
            await page.waitForTimeout(10000); 

            // --- HUMAN WARMUP ---
            console.log('[AntennaSearch] Performing human warm-up (scrolling/moving)...');
            await page.mouse.move(Math.random() * 500, Math.random() * 500, { steps: 20 });
            await page.mouse.wheel(0, 300);
            await page.waitForTimeout(1000 + Math.random() * 1000);
            await page.mouse.wheel(0, -300);
            await page.mouse.move(Math.random() * 800, Math.random() * 600, { steps: 20 });
            await page.waitForTimeout(2000);

            // 2. Type the coordinates character by character
            console.log(`[AntennaSearch] Typing coordinates: ${lat}, ${lon}`);
            await typeLikeHuman('#address1', `${lat}, ${lon}`);
            await page.waitForTimeout(1500);

            // 3. Listen for the JSON response
            const responsePromise = page.waitForResponse(response => 
                response.url().includes('functionSearch.php') && response.status() === 200,
                { timeout: 120000 }
            );

            // 4. Submit via "Enter" key (often safer than clicking Submit button)
            console.log(`[AntennaSearch] Submitting via Enter key...`);
            await page.keyboard.press('Enter');

            // 5. Checkboxes (Wait for transition)
            try {
                await page.waitForTimeout(3000);
                const towerCheck = page.locator('#towerCheck');
                if (await towerCheck.isVisible() && !(await towerCheck.isChecked())) {
                    await towerCheck.check();
                }
            } catch (e) {}

            console.log('[AntennaSearch] Waiting for data response (solve CAPTCHA if it appears)...');
            const response = await responsePromise;
            const data = await response.json();

            console.log(`[AntennaSearch] Received data for ${data.geometries?.length || 0} geometries.`);

            if (data.geometries && Array.isArray(data.geometries)) {
                for (const geo of data.geometries) {
                    const owner = geo.carrier_name || geo.owner || '';
                    const structure = geo.structure_type || geo.category || '';
                    
                    // Filter for AT&T and Rooftop-like structures
                    const isATT = /AT&T|New Cingular|Pacific Bell|Cingular/i.test(owner);
                    const isRooftop = /Building|Rooftop|Steeple|Water Tank|Silo/i.test(structure) || 
                                     geo.category === 'singleAntenna' || 
                                     geo.category === 'multipleAntenna';

                    if (isATT && isRooftop) {
                        results.push({
                            registrationId: geo.registration_number || geo.unique_system_identifier || geo.id,
                            ownerName: owner,
                            address: geo.address || '',
                            structureType: structure,
                            lat: geo.lat,
                            lon: geo.lng,
                            source: 'AntennaSearch',
                            rawData: geo
                        });
                    }
                }
            }

            console.log(`[AntennaSearch] Found ${results.length} matching AT&T rooftop leads.`);
            return results;
        } catch (error: any) {
            console.error(`[AntennaSearch] Error for ${lat},${lon}:`, error.message);
            // Save screenshot on error for debugging
            await page.screenshot({ path: `antennasearch_error_${Date.now()}.png` });
            return [];
        } finally {
            await context.close();
        }
    }
}
