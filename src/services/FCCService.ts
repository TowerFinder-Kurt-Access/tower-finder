import { chromium } from 'playwright-extra';
import { Locator } from 'playwright';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as fs from 'fs';

chromium.use(StealthPlugin());

export class FCCService {
    private static readonly ULS_URL = 'https://wireless2.fcc.gov/UlsApp/UlsSearch/searchGeographic.jsp';
    private static browser: any = null;
    private static context: any = null;
    private static activePage: any = null;

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
     * Stealth Utility: Moves the mouse in a human-like path to an element and clicks it.
     */
    private static async humanClick(locator: Locator) {
        if (!this.activePage) return;
        
        await locator.scrollIntoViewIfNeeded();
        const box = await locator.boundingBox();
        if (!box) {
            console.warn(`[FCC] Could not find bounding box for element. Using fallback click.`);
            return await locator.click(); 
        }

        // Move to a random point within the button (not the exact center)
        const x = box.x + (box.width * (0.3 + Math.random() * 0.4));
        const y = box.y + (box.height * (0.3 + Math.random() * 0.4));

        console.log(`[FCC] 🖱️ Moving mouse to (${Math.round(x)}, ${Math.round(y)})...`);
        
        // Literal mouse move with steps to draw a path
        await this.activePage.mouse.move(x, y, { steps: 20 + Math.floor(Math.random() * 15) });
        await this.activePage.waitForTimeout(500 + Math.random() * 500); // Dwell time
        
        await this.activePage.mouse.down();
        await this.activePage.waitForTimeout(70 + Math.random() * 100); // Pressure/Press duration
        await this.activePage.mouse.up();
        await this.activePage.waitForTimeout(500); // Post-click settle
    }

    /**
     * Discover AT&T antennas by scraping the FCC ULS Geographic Search.
     */
    static async fetchAntennas(lat: number, lon: number, radiusMiles: number = 0.5): Promise<any[]> {
        const results: any[] = [];
        const isHeaded = process.env.FCC_HEADED === '1';
        
        try {
            // STEP 0: Navigation State Machine
            let sessionSuccess = false;

            // Ensure browser exists
            if (!this.browser) {
                console.log('[FCC] Launching stealth browser...');

                // Use real installed Chrome — its fingerprint (plugins, GPU, canvas) passes FCC bot detection.
                // Playwright's bundled Chromium does not, even with stealth plugin.
                const chromePaths = [
                    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
                    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
                    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
                ];
                const executablePath = chromePaths.find(p => {
                    try { return require('fs').existsSync(p); } catch { return false; }
                });

                if (executablePath) {
                    console.log(`[FCC] Using real browser at: ${executablePath}`);
                } else {
                    console.warn('[FCC] Real Chrome not found, falling back to bundled Chromium (may get blocked).');
                }

                this.browser = await chromium.launch({ 
                    headless: !isHeaded,
                    executablePath: executablePath || undefined,
                    args: [
                        '--disable-blink-features=AutomationControlled',
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-dev-shm-usage',
                        '--disable-web-security',
                        '--lang=en-US,en',
                    ]
                });
            }

            for (let attempt = 0; attempt < 3; attempt++) {
                try {
                    // Check if we already have a working page on the geo search
                    const pageAlive = this.activePage && !this.activePage.isClosed();
                    const onGeoPage = pageAlive && this.activePage.url().includes('searchGeographic.jsp');

                    if (onGeoPage) {
                        const html = await this.activePage!.content().catch(() => '');
                        const inputExists = await this.activePage!.locator('input[name="latDeg"]').first().isVisible().catch(() => false);
                        
                        if (html.includes('IntrusionException') || html.includes('An Error has occurred') || html.includes('Access Denied') || !inputExists) {
                            console.warn('[FCC] Session was on GeoSearch URL but lacks the form. Forcing fresh context...');
                            // activePage is NOT closed here. The fresh context block below
                            // will create a new context/page BEFORE closing this one to keep browser alive.
                        } else {
                            // Already there from previous cell — just verify and proceed
                            console.log('[FCC] ✅ Already on GeoSearch page, reusing session.');
                            sessionSuccess = true;
                            break;
                        }
                    }

                    // Need a fresh page — always create new context to clear any block flags
                    console.log(`[FCC] (Attempt ${attempt + 1}) Opening fresh context...`);
                    
                    const oldContext = this.context;
                    const oldPage = this.activePage;

                    this.context = await this.browser.newContext({
                        viewport: { width: 1400, height: 800 }
                    });
                    this.activePage = await this.context.newPage();
                    
                    if (pageAlive && oldPage) await oldPage.close().catch(() => {});
                    if (oldContext) await oldContext.close().catch(() => {});

                    const page = this.activePage;

                    // --- PHASE 1: Establish Valid Java Session ---
                    console.log('[FCC] Establishing session on Advanced Search...');
                    await page.goto('https://wireless2.fcc.gov/UlsApp/UlsSearch/searchAdvanced.jsp', { waitUntil: 'load', timeout: 45000 });
                    await page.waitForTimeout(2000 + Math.random() * 1000);

                    // If Java blocks us instantly
                    let html = await page.content().catch(() => '');
                    if (html.includes('IntrusionException') || html.includes('An Error has occurred') || html.includes('Access Denied')) {
                        console.error('[FCC] 🚨 Blocked on initial entry! Retrying...');
                        continue; // Go to next attempt
                    }

                    // --- PHASE 2: Navigate to Geographic Search ---
                    console.log('[FCC] Navigating to Geographic Search tab...');
                    await page.goto('https://wireless2.fcc.gov/UlsApp/UlsSearch/searchGeographic.jsp', {
                        referer: 'https://wireless2.fcc.gov/UlsApp/UlsSearch/searchAdvanced.jsp',
                        waitUntil: 'load',
                        timeout: 30000
                    });
                    await page.waitForTimeout(1500 + Math.random() * 1000);

                    // --- PHASE 3: Check for block on Geographic ---
                    html = await page.content().catch(() => '');
                    if (html.includes('IntrusionException') || html.includes('An Error has occurred') || html.includes('Access Denied')) {
                        console.error('[FCC] 🚨 Blocked during navigation to Geographic! Retrying...');
                        continue;
                    }

                    // --- PHASE 4: Verify we landed correctly ---
                    if (page.url().includes('searchGeographic.jsp')) {
                        const inputExists = await page.locator('input[name="latDeg"]').first().isVisible().catch(() => false);
                        if (inputExists) {
                            console.log('[FCC] 🔋 Session established on Geographic Search page.');
                            sessionSuccess = true;
                            break; // Success! Exit the retry loop
                        } else {
                            console.warn('[FCC] ⚠️ Geographic form not visible. Content may be blocking. Retrying...');
                            continue;
                        }
                    } else {
                        console.warn(`[FCC] Ended up at unexpectedly blocked URL: ${page.url()}. Retrying...`);
                        continue;
                    }

                } catch (err: any) {
                    console.error(`[FCC] ⚠️ Attempt ${attempt + 1} failed: ${err.message}`);
                }
            }

            if (!sessionSuccess || !this.activePage) {
                throw new Error('Failed to reach Geographic Search page via literal mouse');
            }

            const page = this.activePage;
            const dms = this.decimalToDMS(lat, lon);
            console.log(`[FCC] Discovery starting for ${lat.toFixed(4)}, ${lon.toFixed(4)}...`);

            // 1. SELECT COORDINATE SEARCH MODE
            const coordRadio = page.locator('input[name="searchType"][value="UGCOORD"]').first();
            await this.humanClick(coordRadio);
            await page.waitForTimeout(1000);

            // 2. MOUSE-DRIVEN DATA ENTRY
            console.log('[FCC] Scrolling into position...');
            await page.evaluate(() => window.scrollTo(0, 400));
            await page.waitForTimeout(1000);

            const fields = [
                { name: 'latDeg', value: dms.lat.deg },
                { name: 'latMin', value: dms.lat.min },
                { name: 'latSec', value: dms.lat.sec },
                { name: 'longDeg', value: dms.lon.deg },
                { name: 'longMin', value: dms.lon.min },
                { name: 'longSec', value: dms.lon.sec }
            ];

            for (const field of fields) {
                const locator = page.locator(`input[name="${field.name}"]`).first();
                console.log(`      - Entering ${field.name}...`);
                await this.humanClick(locator);
                await page.keyboard.type(field.value.toString(), { delay: 100 + Math.random() * 60 });
                await page.waitForTimeout(300 + Math.random() * 400);
            }

            // Direction Selection
            const lonDir = page.locator('select[name="longDir"]').first();
            await this.humanClick(lonDir);
            await page.keyboard.press('W'); // Toggle West
            await page.waitForTimeout(800);

            // Radius
            const radius = page.locator('input[name="radius"]').first();
            await this.humanClick(radius);
            await page.keyboard.type(radiusMiles.toString(), { delay: 120 });

            // SUBMIT
            console.log('[FCC] Moving to Submit button...');
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            const searchBtn = page.locator('input[type="button"][value="Search"], input[type="submit"][value="Search"]').first();
            await this.humanClick(searchBtn);
            
            await page.waitForLoadState('load', { timeout: 45000 }).catch(() => {});
            await page.waitForTimeout(4000);

            const currentUrl = page.url();
            if (!currentUrl.includes('results.jsp')) {
                console.log('[FCC] No results found for this location.');
                return [];
            }

            // SCAN RESULTS (Up to 5 pages)
            for (let pageNum = 1; pageNum <= 5; pageNum++) {
                console.log(`[FCC] Scanning page ${pageNum}...`);
                const resultTable = page.locator('table').filter({ hasText: 'Call Sign/Lease ID' }).last();
                const rows = resultTable.locator('tr');
                const rowCount = await rows.count();

                for (let i = 0; i < rowCount; i++) {
                    const text = await rows.nth(i).innerText();
                    if (/AT&T|Cingular|Santa Barbara Cellular|Mobility/i.test(text)) {
                        const cells = rows.nth(i).locator('td');
                        if (await cells.count() >= 5) {
                            const callSignLink = cells.nth(1).locator('a');
                            if (await callSignLink.count() > 0) {
                                const callSign = (await callSignLink.innerText()).trim();
                                const href = await callSignLink.getAttribute('href') || '';
                                const licKey = (href.match(/licKey=(\d+)/) || [])[1] || '';
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
                    await this.humanClick(nextBtn);
                    await page.waitForLoadState('load').catch(() => {});
                    await page.waitForTimeout(2000);
                } else {
                    break;
                }
            }

            // ENRICH
            console.log(`[FCC] Enriching ${results.length} found licenses...`);
            for (const result of results) {
                if (result.licKey) {
                    const enrichment = await this.enrichLicenseDetail(page, result.licKey, result.registrationId);
                    Object.assign(result, { isConfirmedRooftop: enrichment.isRooftop, towerDetails: enrichment.details });
                }
            }
 
            return results;
        } catch (err) {
            console.error(`[FCC] Critical error during discovery: ${err.message}`);
            if (this.activePage && !this.activePage.isClosed()) {
                await this.activePage.screenshot({ path: `fcc_error_${Date.now()}.png` }).catch(() => {});
            }
            throw err;
        }
    }

    /**
     * Stable Pipeline 2.0: Discover AT&T antennas by searching a whole state by licensee,
     * then drilling into each license to find matches in a specific county + building structure.
     */
    static async discoverCountyLeads(state: string, county: string, licensee: string = 'NEW CINGULAR WIRELESS PCS, LLC'): Promise<any[]> {
        const results: any[] = [];
        const isHeaded = process.env.FCC_HEADED === '1';

        try {
            // STEP 0: Establish Browser (Reuse fetchAntennas launch logic)
            if (!this.browser) {
                const chromePaths = [
                    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
                    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
                ];
                const executablePath = chromePaths.find(p => {
                    try { return require('fs').existsSync(p); } catch { return false; }
                });

                this.browser = await chromium.launch({ 
                    headless: !isHeaded,
                    executablePath: executablePath || undefined,
                    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
                });
            }

            // Fresh context for each county to avoid cookies/state issues
            const context = await this.browser.newContext({ viewport: { width: 1400, height: 800 } });
            const page = await context.newPage();

            console.log(`[FCC-County] Starting discovery for ${licensee} in ${county}, ${state}...`);

            // STEP 1: Search by State + Licensee
            await page.goto('https://wireless2.fcc.gov/UlsApp/UlsSearch/searchAdvanced.jsp', { waitUntil: 'load', timeout: 45000 });
            await page.waitForTimeout(1000);

            // Fill Licensee Name
            const nameInput = page.locator('input[name="fiOwnerName"]').first();
            await nameInput.type(licensee, { delay: 100 });

            // Select State
            const stateSelect = page.locator('select[name="ulsState"]').first();
            await stateSelect.selectOption({ label: state });

            // Select Active status only (to reduce noise)
            const activeRadio = page.locator('input[name="ulsStatus"][value="A"]').first();
            if (await activeRadio.count() > 0) await activeRadio.check();

            // Submit
            const searchBtn = page.locator('input[type="submit"][value="Search"]').first();
            await this.humanClick(searchBtn);
            await page.waitForLoadState('load');
            await page.waitForTimeout(3000);

            // STEP 2: Collect Call Signs (Paginate)
            const callSigns: { callSign: string; licKey: string }[] = [];
            for (let pageNum = 1; pageNum <= 10; pageNum++) { // Scan up to 10 pages (~1000 licenses)
                console.log(`[FCC-County] Collecting call signs from result page ${pageNum}...`);
                
                const rows = await page.locator('table tr').all();
                for (const row of rows) {
                    const text = await row.innerText();
                    if (text.includes('Active')) {
                        const link = row.locator('a[href*="licKey="]').first();
                        if (await link.count() > 0) {
                            const callSign = (await link.innerText()).trim();
                            const href = await link.getAttribute('href') || '';
                            const licKey = (href.match(/licKey=(\d+)/) || [])[1] || '';
                            if (callSign && licKey) callSigns.push({ callSign, licKey });
                        }
                    }
                }

                const nextBtn = page.locator('a:has-text("Next")').first();
                if (await nextBtn.isVisible() && pageNum < 10) {
                    await nextBtn.click();
                    await page.waitForLoadState('load');
                    await page.waitForTimeout(2000);
                } else {
                    break;
                }
            }

            console.log(`[FCC-County] Found ${callSigns.length} Call Signs. Drilling into locations for ${county}...`);

            // STEP 3: Drill into Locations (Parallelize discovery slightly?)
            // For now, sequentially to avoid session blocks
            for (const item of callSigns) {
                const locSummaryUrl = `https://wireless2.fcc.gov/UlsApp/UlsSearch/licenseLocSum.jsp?licKey=${item.licKey}`;
                await page.goto(locSummaryUrl, { waitUntil: 'load', timeout: 20000 });
                await page.waitForTimeout(1000);

                const bodyText = await page.innerText('body');
                if (bodyText.toUpperCase().includes(county.toUpperCase()) && bodyText.includes('Building')) {
                    console.log(`[FCC-County] Found potential BUILDING location in ${county} for ${item.callSign}!`);
                    
                    // Extract exact location details
                    const locLinks = await page.locator('a[href*="licenseLocDetail.jsp"]').all();
                    for (const locLink of locLinks) {
                        const locHref = await locLink.getAttribute('href') || '';
                        await page.goto(`https://wireless2.fcc.gov/UlsApp/UlsSearch/${locHref}`);
                        
                        const locContent = await page.innerText('body');
                        const isCountyMatch = locContent.toUpperCase().includes(county.toUpperCase());
                        const isBuilding = /Building/i.test(locContent);

                        if (isCountyMatch && isBuilding) {
                             // Correct Latitude/Longitude from detail page
                             const latMatch = locContent.match(/Latitude:\s*(\d+)°\s*(\d+)'\s*([\d.]+)"\s*([NS])/i);
                             const lonMatch = locContent.match(/Longitude:\s*(\d+)°\s*(\d+)'\s*([\d.]+)"\s*([EW])/i);
                             
                             if (latMatch && lonMatch) {
                                 const lat = parseFloat(latMatch[1]) + parseFloat(latMatch[2])/60 + parseFloat(latMatch[3])/3600;
                                 const lon = (parseFloat(lonMatch[1]) + parseFloat(lonMatch[2])/60 + parseFloat(lonMatch[3])/3600) * (lonMatch[4] === 'W' ? -1 : 1);
                                 
                                 results.push({
                                     registrationId: item.callSign,
                                     licKey: item.licKey,
                                     ownerName: licensee,
                                     lat,
                                     lon,
                                     county: county,
                                     structureType: 'Building',
                                     source: 'FCC_ULS_COUNTY'
                                 });
                             }
                        }
                        // Avoid over-visiting to prevent block
                        await page.goto(locSummaryUrl); 
                    }
                }
            }

            await context.close();
            return results;

        } catch (err: any) {
            console.error(`[FCC-County] Error: ${err.message}`);
            return results;
        }
    }

    /**
     * Call this when the entire scan is finished to cleanup the shared browser.
     */
    static async closeBrowser() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            this.context = null;
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
