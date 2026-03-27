import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

// Add the stealth plugin
chromium.use(StealthPlugin());

/**
 * CellMapperService
 * Scrapes live signal data from CellMapper.
 * Features: Playwright Stealth, Response Interception.
 */
export class CellMapperService {
    private static readonly BASE_URL = 'https://www.cellmapper.net/map';

    /**
     * Fetches live tower data for a specific area.
     * @param lat Latitude 
     * @param lon Longitude
     * @returns Array of tower records from the intercepted API response
     */
    static async fetchTowers(lat: number, lon: number): Promise<any[]> {
        const browser = await chromium.launch({ headless: true });
        const context = await browser.newContext({
            viewport: { width: 1280, height: 720 },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        });

        const page = await context.newPage();
        const towerResults: any[] = [];

        try {
            // Setup response interception for the 'getTowers' API call
            page.on('response', async (response) => {
                if (response.url().includes('getTowers') && response.status() === 200) {
                    try {
                        const data = await response.json();
                        if (Array.isArray(data)) {
                            // Filter for AT&T (MCC: 310, MNC: 410)
                            const attTowers = data.filter((tower: any) => 
                                tower.mcc === 310 && tower.mnc === 410
                            );
                            towerResults.push(...attTowers);
                        }
                    } catch (e) {
                        // Response might not be JSON or already consumed
                    }
                }
            });

            // Navigate to the map centered on the coordinates
            // CellMapper URL pattern: ?lat=XX&lon=YY&zoom=15&mcc=310&mnc=410
            const url = `${this.BASE_URL}?lat=${lat}&lon=${lon}&zoom=15&mcc=310&mnc=410`;
            await page.goto(url, { waitUntil: 'networkidle' });

            // Wait a bit for the markers to load and responses to flutter in
            await page.waitForTimeout(5000);

            return towerResults;
        } catch (error: any) {
            console.error(`[CellMapper] Error for ${lat},${lon}:`, error.message);
            throw error;
        } finally {
            await browser.close();
        }
    }
}
