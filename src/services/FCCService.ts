import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as fs from 'fs';

chromium.use(StealthPlugin());

export class FCCService {
    private static readonly ULS_URL = 'https://wireless2.fcc.gov/UlsApp/UlsSearch/searchGeographic.jsp';

    private static decimalToDMS(lat: number, lon: number) {
        const convert = (decimal: number) => {
            const absolute = Math.abs(decimal);
            const deg = Math.floor(absolute);
            const min = Math.floor((absolute - deg) * 60);
            const rawSec = ((absolute - deg) * 60 - min) * 60;
            const sec = Math.round(rawSec);
            return { deg: deg.toString(), min: min.toString(), sec: sec.toString() };
        };

        return {
            lat: { ...convert(lat), dir: lat >= 0 ? 'N' : 'S' },
            lon: { ...convert(lon), dir: lon >= 0 ? 'E' : 'W' } // Negative longitude = West (US is negative)
        };
    }

    /**
     * Discover AT&T antennas by scraping the FCC ULS Geographic Search.
     * Scans multiple pages to ensure results aren't missed due to volume.
     */
    static async fetchAntennas(lat: number, lon: number, radiusMiles: number = 0.5): Promise<any[]> {
        const results: any[] = [];
        const browser = await chromium.launch({ headless: true });
        const context = await browser.newContext();
        const page = await context.newPage();

        try {
            console.log(`[FCC] Discovery starting for ${lat}, ${lon} (radius: ${radiusMiles}mi)`);
            
            // STEP 1: Advanced Search for Carrier Filter
            console.log('[FCC] Starting Advanced License Search for carrier filter...');
            await page.goto('https://wireless2.fcc.gov/UlsApp/UlsSearch/searchAdvanced.jsp', { waitUntil: 'domcontentloaded', timeout: 45000 });
            await page.fill('input[name="fiOwnerName"]', 'New Cingular*');
            console.log('[FCC] Carrier filter set. Clicking GEOSEARCH...');
            await page.click('a[title="GeoSearch"]');

            await page.waitForURL(url => url.toString().includes('searchGeographic.jsp'), { timeout: 30000 });
            console.log('[FCC] Carrier filter applied. Navigating to Geographic coordinate search...');

            // STEP 2: Geographic Coordinate Search
            const dms = this.decimalToDMS(lat, lon);
            
            // Fill form fields WITHOUT submitting (prepare for Playwright-tracked navigation)
            await page.evaluate((d) => {
                const form = document.querySelector('form[name="ULSForm"]') as any;
                if (form) {
                    form.searchType[1].checked = true; // Coordinates radio
                    form.latDeg.value = d.lat.deg;
                    form.latMin.value = d.lat.min;
                    form.latSec.value = d.lat.sec;
                    form.latDir.value = d.lat.dir;
                    form.lonDeg.value = d.lon.deg;
                    form.lonMin.value = d.lon.min;
                    form.lonSec.value = d.lon.sec;
                    form.lonDir.value = d.lon.dir;
                    form.radius.value = d.radius;
                    form.radiusunit.value = 'MI';
                    form.hiddenForm.value = 'hiddenForm';
                    form.searchType.value = 'UGCOORD';
                }
            }, { ...dms, radius: radiusMiles.toString() });

            // Submit form WITH Playwright navigation tracking
            // form.submit() inside evaluate() bypasses Playwright's navigation detection,
            // causing waitForURL to always time out. Using Promise.all ensures proper tracking.
            await Promise.all([
                page.waitForNavigation({ waitUntil: 'load', timeout: 45000 }),
                page.evaluate(() => {
                    const form = document.querySelector('form[name="ULSForm"]') as any;
                    if (form) form.submit();
                })
            ]);

            const currentUrl = page.url();
            console.log(`[FCC] After form submit, current URL: ${currentUrl}`);

            if (!currentUrl.includes('results.jsp')) {
                console.log('[FCC] Did not reach results.jsp — no results for this location.');
                return results;
            }

            // Scan up to 5 pages for results
            for (let pageNum = 1; pageNum <= 5; pageNum++) {
                console.log(`[FCC] Scanning results page ${pageNum}...`);
                const resultTable = page.locator('table').filter({ hasText: 'Call Sign/Lease ID' }).last();
                const rows = resultTable.locator('tr');
                const rowCount = await rows.count();
                console.log(`[FCC] Found ${rowCount} rows in results table on page ${pageNum}`);

                for (let i = 0; i < rowCount; i++) {
                    const text = await rows.nth(i).innerText();
                    if (/AT&T|Cingular|Santa Barbara Cellular|Pacific Bell|Mobility/i.test(text)) {
                        const cells = rows.nth(i).locator('td');
                        const cellCount = await cells.count();
                        if (cellCount >= 5) {
                            const callSignLink = cells.nth(1).locator('a');
                            if (await callSignLink.count() > 0) {
                                const callSign = (await callSignLink.innerText()).trim();
                                const href = await callSignLink.getAttribute('href') || '';
                                const licKeyMatch = href.match(/licKey=(\d+)/);
                                const licKey = licKeyMatch ? licKeyMatch[1] : '';
                                const licensee = (await cells.nth(2).innerText()).trim();

                                if (callSign.length > 3 && !results.find(r => r.registrationId === callSign)) {
                                    results.push({ registrationId: callSign, licKey, ownerName: licensee, source: 'FCC_ULS', lat, lon });
                                }
                            }
                        }
                    }
                }

                const nextBtn = page.locator('img[alt="Next"], a:has-text("Next")').first();
                if (await nextBtn.isVisible() && pageNum < 5) {
                    await nextBtn.click();
                    await page.waitForTimeout(2000); 
                } else {
                    break;
                }
            }

            // Enrich findings
            console.log(`[FCC] Enriching ${results.length} found AT&T licenses...`);
            for (const result of results) {
                if (result.licKey) {
                    const enrichment = await this.enrichLicenseDetail(page, result.licKey, result.registrationId);
                    Object.assign(result, {
                        isConfirmedRooftop: enrichment.isRooftop,
                        mapScreenshot: enrichment.screenshotPath,
                        supportStructure: enrichment.structure,
                        asrNumber: enrichment.asrNumber
                    });
                }
            }

            console.log(`[FCC] Successfully captured ${results.length} AT&T records.`);
            return results;
        } catch (error: any) {
            console.error(`[FCC] Error:`, error.message);
            // Capture error state if possible
            try {
                const errorPath = `fcc_error_${Date.now()}.png`;
                await page.screenshot({ path: errorPath });
                console.log(`[FCC] Error screenshot saved to ${errorPath}`);
            } catch (e) {}
            return [];
        } finally {
            await browser.close();
        }
    }

    /**
     * Deep-level enrichment for a license to verify rooftop status and capture map evidence.
     */
    private static async enrichLicenseDetail(page: any, licKey: string, callSign: string): Promise<any> {
        const locSumUrl = `https://wireless2.fcc.gov/UlsApp/UlsSearch/licenseLocSum.jsp?licKey=${licKey}`;
        await page.goto(locSumUrl, { waitUntil: 'load', timeout: 30000 });
        
        // Find links to location details
        const locLinks = page.locator('a[href*="licenseLocDetail.jsp"]');
        const locCount = Math.min(await locLinks.count(), 5); // Limit to top 5 locations for speed
        
        let isRooftop = false;
        let foundStructure = 'Unknown';
        let foundAsr = 'N/A';
        let screenshotPath = '';

        for (let i = 0; i < locCount; i++) {
            const locHref = await locLinks.nth(i).getAttribute('href') || '';
            const fullLocUrl = `https://wireless2.fcc.gov/UlsApp/UlsSearch/${locHref}`;
            
            await page.goto(fullLocUrl, { waitUntil: 'load', timeout: 20000 });
            const content = await page.innerText('body');
            
            // Capture Structure Type
            const structMatch = content.match(/Support Structure Type:\s*(.*)/i) || content.match(/Structure Type:\s*(.*)/);
            if (structMatch) foundStructure = structMatch[1].trim();

            // Capture ASR Number
            const asrMatch = content.match(/ASR #\/File #:\s*(.*)/i);
            if (asrMatch) foundAsr = asrMatch[1].trim();

            const isBuilding = /Building/i.test(foundStructure) || /B - Building/i.test(foundStructure);
            
            if (isBuilding) {
                isRooftop = true;
                
                // If confirmed rooftop, capture the map evidence
                try {
                    console.log(`[FCC] Found rooftop at ${callSign} Loc ${i+1}. Capturing map...`);
                    const mapTab = page.locator('a[title="Map"], img[alt="Map"]').first();
                    if (await mapTab.isVisible()) {
                        await mapTab.click();
                        await page.waitForSelector('#map', { timeout: 15000 });
                        await page.waitForTimeout(2000); // Wait for tiles
                        screenshotPath = `fcc_map_${callSign}_loc${i+1}_${Date.now()}.png`;
                        await page.screenshot({ path: screenshotPath });
                    }
                } catch (mapErr) {
                    console.log(`[FCC] Map capture failed for ${callSign}: ${mapErr.message}`);
                }
                break; // Found one, that's enough for confirmation
            }
        }
        
        return { isRooftop, structure: foundStructure, asrNumber: foundAsr, screenshotPath };
    }
}
