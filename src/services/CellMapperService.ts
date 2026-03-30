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
        // Dedicated session folder
        const userDataDir = './discovery_session_cellmapper';

        const context = await chromium.launchPersistentContext(userDataDir, {
            headless: true,
            args: [
                '--disable-blink-features=AutomationControlled',
                '--no-sandbox'
            ],
            viewport: { width: 1280, height: 720 },
            permissions: ['geolocation'],
            geolocation: { latitude: lat, longitude: lon }
        });

        const page = context.pages()[0] || await context.newPage();
        const towerResults: any[] = [];
        
        // Random delay to avoid instant navigation
        await new Promise(res => setTimeout(res, 2000 + Math.random() * 3000));

        // Navigate to the map centered on the coordinates
        // Using the user's provided working URL structure
        const url = `${this.BASE_URL}?MCC=310&MNC=410&type=NR&latitude=${lat}&longitude=${lon}&zoom=16&showTowers=true&showIcons=true`;

        try {
            console.log(`[CellMapper] Navigating to ${url}`);
            
            // Setup response interception for the 'getTowers' API call
            page.on('response', async (response) => {
                const resUrl = response.url();
                if (resUrl.includes('getTowers') && response.status() === 200) {
                    try {
                        const data = await response.json();
                        // Handle the structure provided by the user: { responseData: [...] }
                        const towers = Array.isArray(data) ? data : (data.responseData || []);
                        
                        console.log(`[CellMapper] Intercepted ${towers.length} total towers.`);
                        
                        if (towers.length > 0) {
                            // Since we filtered the URL for AT&T (310/410), 
                            // we can safely assume these are our targets if mcc/mnc are missing
                            const attTowers = towers.filter((tower: any) => {
                                const isATT = !tower.mcc || (String(tower.mcc) === '310' && String(tower.mnc) === '410');
                                return isATT;
                            });

                            console.log(`[CellMapper] Captured ${attTowers.length} AT&T towers.`);
                            
                            // Map the fields to our internal format (handling latitude vs lat)
                            const mapped = attTowers.map((t: any) => ({
                                ...t,
                                latitude: t.latitude || t.lat,
                                longitude: t.longitude || t.lon,
                                id: t.siteID || t.id
                            }));
                            
                            towerResults.push(...mapped);
                        }
                    } catch (e: any) {
                        console.error(`[CellMapper] JSON parse error: ${e.message}`);
                    }
                }
            });

            await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
            console.log(`[CellMapper] Page loaded, title: ${await page.title()}`);
            
            // Wait for any initial overlay or modal to stabilize
            await page.waitForTimeout(3000);

            // Handle the "Welcome" or "Cookies" modal if it appears
            try {
                // Look for the specific Bootbox button the user described
                const agreeButton = page.locator('button[data-bb-handler="ok"]:has-text("I Agree"), button.btn-primary:has-text("I Agree")').first();
                
                console.log('[CellMapper] Checking for "I Agree" modal...');
                if (await agreeButton.isVisible({ timeout: 15000 })) {
                    console.log('[CellMapper] Clicking "I Agree" button...');
                    await agreeButton.click();
                    await page.waitForTimeout(2000); // Wait for modal to fade out
                } else {
                    console.log('[CellMapper] "I Agree" button not immediately visible, scanning for any overlay...');
                    // Fallback to broader text match if specific one isn't visible
                    const fallbackAgree = page.locator('button:has-text("I Agree"), .btn:has-text("I Agree"), .md-button:has-text("I Agree")').first();
                    if (await fallbackAgree.isVisible({ timeout: 5000 })) {
                        await fallbackAgree.click();
                        await page.waitForTimeout(2000);
                    }
                }

                // New Logic: Select AT&T from the Provider Selection Table
                console.log('[CellMapper] Checking for AT&T Mobility selection table...');
                const attCell = page.locator('td.aProviderCell[title="310-410"], td:has-text("AT&T Mobility")').first();
                if (await attCell.isVisible({ timeout: 10000 })) {
                    console.log('[CellMapper] Found AT&T Mobility cell. Clicking 5G NR...');
                    const nrLink = attCell.locator('a:has-text("5G NR")');
                    const lteLink = attCell.locator('a:has-text("4G LTE")');
                    
                    if (await nrLink.isVisible()) {
                        await nrLink.click();
                    } else if (await lteLink.isVisible()) {
                        await lteLink.click();
                    }
                    await page.waitForTimeout(2000);

                    // Click the final "OK" button that appears after selection
                    const finalOk = page.locator('button[data-bb-handler="ok"]:has-text("OK")').first();
                    if (await finalOk.isVisible({ timeout: 5000 })) {
                        console.log('[CellMapper] Clicking final "OK" button...');
                        await finalOk.click();
                    }
                    await page.waitForTimeout(3000); // Wait for map to refresh
                }
            } catch (e) {
                console.log('[CellMapper] Modal/Selection handling error: ' + e.message);
            }

            // Simulate human interaction to trigger potential lazy-loading
            await page.mouse.move(Math.random() * 500, Math.random() * 500);
            await page.mouse.wheel(0, 1); 

            console.log('[CellMapper] Waiting 15 seconds for data to load...');
            // Wait a bit for the markers to load and responses to flutter in
            await page.waitForTimeout(15000); 

            return towerResults;
        } catch (error: any) {
            console.error(`[CellMapper] Error for ${lat},${lon}:`, error.message);
            throw error;
        } finally {
            await context.close();
        }
    }
}
