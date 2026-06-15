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
     * Stable Pipeline 2.3: Discover AT&T antennas by using the FCC Geographic State/County Search.
     * This bypasses the licensee mailing address trap and coordinates blocking.
     */
    static async discoverCountyLeads(
        state: string, 
        county: string, 
        licensee: string = 'NEW CINGULAR WIRELESS PCS, LLC',
        options: { startPage?: number, onPageProgress?: (page: number) => Promise<void> } = {}
    ): Promise<any[]> {
        const results: any[] = [];
        const isHeaded = process.env.FCC_HEADED === '1';
        const startPage = options.startPage || 1;

        try {
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

            const context = await this.browser.newContext({ viewport: { width: 1400, height: 800 } });
            const page = await context.newPage();

            try {
                // Return to Geographic Search as requested
                console.log(`[FCC-County] 🌎 Navigating to Geographic Search for ${county}, ${state}...`);
                if (startPage > 1) console.log(`[FCC-County] ⏩ Resuming from Page ${startPage}.`);
                
                await page.goto('https://wireless2.fcc.gov/UlsApp/UlsSearch/searchGeographic.jsp', { waitUntil: 'load', timeout: 60000 });
                
                // 1. Select State / County Mode
                const radio = page.locator('input[name="searchType"][value="UGCOUNTY"], input[name="searchType"][value="STC"]').first();
                await radio.click();
                await page.waitForTimeout(1000);

                // 2. Select State
                const stateSelect = page.locator('select[name="countyState"]').first();
                await stateSelect.selectOption({ label: state });
                console.log(`[FCC-County] Selected State: ${state}. Waiting for county list...`);
                await page.waitForTimeout(500); 

                // 3. Select County
                const countySelect = page.locator('select[name="ulsCounty"]').first();
                // Wait for any option other than the default to appear
                await countySelect.locator('option').nth(2).waitFor({ state: 'attached', timeout: 5000 }).catch(() => {});
                
                const countyOptions = await countySelect.locator('option').allInnerTexts();
                const bestMatch = countyOptions.find(o => o.toUpperCase().includes(county.toUpperCase()));
                
                if (bestMatch) {
                    await countySelect.selectOption({ label: bestMatch });
                    console.log(`[FCC-County] Selected County: ${bestMatch}.`);
                } else {
                    await countySelect.selectOption(new RegExp(county, 'i'));
                }
                await page.waitForTimeout(250); 

                // 4. Submit Search
                console.log(`[FCC-County] Clicking search button...`);
                await Promise.all([
                    page.waitForNavigation({ waitUntil: 'load', timeout: 30000 }).catch(() => {}),
                    page.click('input[type="image"][alt*="Search"]')
                ]);
                
                if (!page.url().includes('results.jsp')) {
                    // Fallback click if navigation didn't trigger
                    await page.click('input[type="image"][alt*="Search"]').catch(() => {});
                    await page.waitForTimeout(1000);
                }
                
                console.log(`[FCC-County] Search submitted. Waiting for results table...`);
                await page.waitForSelector('table', { timeout: 30000 });

                // 5. Scan Results
                let pageNum = 1;
                const processedLicKeys = new Set<string>(); // Global Set for this county scan

                const detailPage = await context.newPage();

                while (pageNum <= 200) { // Safety cap
                    // ⏩ AGGRESSIVE FAST-FORWARD
                    if (pageNum < startPage) {
                        console.log(`[FCC-County] ⏩ Skipping page ${pageNum}...`);
                        const nextBtn = page.locator('a[title="Next page of results"]').first();
                        try {
                            await nextBtn.click({ timeout: 5000 });
                            // Wait for the URL to change or a short timeout
                            await Promise.race([
                                page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }),
                                page.waitForTimeout(3000) // Aggressive fallback
                            ]).catch(() => {});
                            pageNum++;
                            continue; 
                        } catch (e) {
                            console.log(`[FCC-County] ⚠️ Fast-forward failed at page ${pageNum}. Retrying search...`);
                            // If we fail to click Next, we might need to re-submit the search
                            break; 
                        }
                    }

                    console.log(`[FCC-County] 🔍 Scanning result page ${pageNum} for ${county}...`);
                    
                    // ANALYSIS BLOCK
                    const rows = await page.locator('table tr').all();
                    const pageCallSigns: { callSign: string; licKey: string }[] = [];

                    for (const row of rows) {
                        const rowText = await row.innerText();
                        const match = rowText.match(/AT&T|Cingular|Mobility|New Cingular|Santa Barbara Cellular/i);
                        if (match) {
                            const link = row.locator('a[href*="licKey="]').first();
                            if (await link.count() > 0) {
                                const callSign = (await link.innerText()).trim();
                                const href = await link.getAttribute('href') || '';
                                const licKey = (href.match(/licKey=(\d+)/) || [])[1] || '';
                                
                                if (callSign && licKey && !processedLicKeys.has(licKey)) {
                                    console.log(`  ├─ [Match] Found "${match[0]}" in row ${callSign}.`);
                                    pageCallSigns.push({ callSign, licKey });
                                    processedLicKeys.add(licKey);
                                }
                            }
                        }
                    }

                    if (pageCallSigns.length === 0) {
                        console.log(`[FCC-County] No NEW AT&T sites on page ${pageNum}. Skipping...`);
                    } else {
                        console.log(`[FCC-County] Row Check: Found ${pageCallSigns.length} candidates on page ${pageNum}.`);
                        
                        for (const item of pageCallSigns) {
                            try {
                                process.stdout.write(`  ├─ [Analyzing] ${item.callSign}... `);
                                
                                let targetLicKey = item.licKey;
                                let isLease = item.callSign.startsWith('L');

                                if (isLease) {
                                    // LEASE BRIDGE: Find the Parent License
                                    const leaseUrl = `https://wireless2.fcc.gov/UlsApp/UlsSearch/leaseMain.jsp?licKey=${item.licKey}`;
                                    await detailPage.goto(leaseUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
                                    
                                    const parentLink = detailPage.locator('a[href*="license.jsp?licKey="], a[href*="licenseMain.jsp?licKey="]').first();
                                    if (await parentLink.count() > 0) {
                                        const parentHref = await parentLink.getAttribute('href') || '';
                                        const parentKeyMatch = parentHref.match(/licKey=(\d+)/);
                                        if (parentKeyMatch && parentKeyMatch[1]) {
                                            targetLicKey = parentKeyMatch[1];
                                        }
                                    }
                                }

                                const locSummaryUrl = `https://wireless2.fcc.gov/UlsApp/UlsSearch/licenseLocSum.jsp?licKey=${targetLicKey}`;
                                await detailPage.goto(locSummaryUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
                                
                                // Detect Market-based licenses (No Locations)
                                if (await detailPage.locator('text=No Locations found').count() > 0) {
                                    process.stdout.write("⏩ Skipped: Market-based (No Locations)\n");
                                    continue;
                                }

                                // --- START REVISED EXTRACTION ---
                                const detailText = await detailPage.innerText('body');
                                let siteFound = false;
                                let foundLocations: { text: string; structureType: string; directCoords?: string }[] = [];

                                // Check for Format A: Individual links (Standard/IG)
                                const locLinks = await detailPage.locator('a[href*="licenseLocDetail.jsp"]').all();
                                
                                if (locLinks.length > 0) {
                                    // Process up to 15 links for speed (usually more than enough for tower discovery)
                                    for (const link of locLinks.slice(0, 15)) {
                                        const detailUrl = await link.getAttribute('href');
                                        if (!detailUrl) continue;

                                        await detailPage.goto(`https://wireless2.fcc.gov/UlsApp/UlsSearch/${detailUrl}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
                                        const subDetailText = await detailPage.innerText('body');
                                        const structureCell = detailPage.locator('td:has-text("Support Structure Type") + td, td:has-text("Structure Type") + td').first();
                                        const structureType = (await structureCell.count() > 0) ? (await structureCell.innerText()).trim() : 'Unknown';

                                        foundLocations.push({ text: subDetailText, structureType });
                                    }
                                } else {
                                    // Handle Format B: Direct entry on summary page (Microwave/Common Carrier)
                                    // We look for nested tables that contain both Coordinates and Support Structure Type
                                    const tables = await detailPage.locator('table').all();
                                    for (const table of tables) {
                                        const tableText = await table.innerText();
                                        // Specific to CF/Microwave layout where label and value are adjacent
                                        if (tableText.includes('Coordinates') && (tableText.includes('Support Structure Type') || tableText.includes('Structure Type'))) {
                                            const structureMatch = tableText.match(/(?:Support )?Structure Type\s+([^\n\r]+)/i);
                                            const coordsMatch = tableText.match(/Coordinates\s+([^\n\r]+)/i);
                                            if (coordsMatch) {
                                                foundLocations.push({ 
                                                    text: tableText, 
                                                    structureType: structureMatch ? structureMatch[1].trim() : 'Unknown',
                                                    directCoords: coordsMatch[1].trim()
                                                });
                                            }
                                        }
                                    }
                                }

                                if (foundLocations.length === 0) {
                                    process.stdout.write("⏩ Skipped: No individual locations listed.\n");
                                    continue;
                                }

                                for (const loc of foundLocations) {
                                    const structureType = loc.structureType;
                                    const isBuilding = /Building|Rooftop|B - Building|MTOWER - Monopole|TOWER - Free standing|LTOWER - Lattice|POLE - Any type of Pole/i.test(structureType) || /Building|Rooftop/i.test(loc.text);
                                    
                                    if (isBuilding) {
                                        let lat: number | null = null;
                                        let lon: number | null = null;

                                        // Try various coordinate formats
                                        if (loc.directCoords) {
                                            // Format 1: 39-16-41.0 N, 121-01-35.7 W
                                            const parts = loc.directCoords.match(/(\d+)-(\d+)-([\d.]+)\s*([NS]),\s*(\d+)-(\d+)-([\d.]+)\s*([EW])/);
                                            if (parts) {
                                                lat = parseFloat(parts[1]) + parseFloat(parts[2])/60 + parseFloat(parts[3])/3600;
                                                if (parts[4] === 'S') lat *= -1;
                                                lon = parseFloat(parts[5]) + parseFloat(parts[6])/60 + parseFloat(parts[7])/3600;
                                                if (parts[8] === 'W') lon *= -1;
                                            }
                                        } 
                                        
                                        // Fallback to text parsing (Standard Detail Page)
                                        if (lat === null) {
                                            // Format 2: Latitude: 39° 7' 31.0" N
                                            const latMatch = loc.text.match(/Latitude:\s*(\d+)°\s*(\d+)'\s*([\d.]+)"\s*([NS])/i);
                                            const lonMatch = loc.text.match(/Longitude:\s*(\d+)°\s*(\d+)'\s*([\d.]+)"\s*([EW])/i);
                                            
                                            if (latMatch && lonMatch) {
                                                lat = parseFloat(latMatch[1]) + parseFloat(latMatch[2])/60 + parseFloat(latMatch[3])/3600;
                                                if (latMatch[4] === 'S') lat *= -1;
                                                lon = parseFloat(lonMatch[1]) + parseFloat(lonMatch[2])/60 + parseFloat(lonMatch[3])/3600;
                                                if (lonMatch[4] === 'W') lon *= -1;
                                            }
                                        }

                                        // Format 3: DMS without degrees symbol but with dashes (found in some sub-tables)
                                        if (lat === null) {
                                            const dmsMatch = loc.text.match(/(\d+)-(\d+)-([\d.]+)\s*([NS])[\s,]+(\d+)-(\d+)-([\d.]+)\s*([EW])/i);
                                            if (dmsMatch) {
                                                lat = parseFloat(dmsMatch[1]) + parseFloat(dmsMatch[2])/60 + parseFloat(dmsMatch[3])/3600;
                                                if (dmsMatch[4] === 'S') lat *= -1;
                                                lon = parseFloat(dmsMatch[5]) + parseFloat(dmsMatch[6])/60 + parseFloat(dmsMatch[7])/3600;
                                                if (dmsMatch[8] === 'W') lon *= -1;
                                            }
                                        }

                                        if (lat !== null && lon !== null) {
                                            results.push({
                                                registrationId: item.callSign,
                                                licKey: item.licKey,
                                                parentLicKey: isLease ? targetLicKey : undefined,
                                                ownerName: licensee,
                                                lat,
                                                lon,
                                                county: county,
                                                structureType: structureType || 'Building',
                                                source: 'FCC_ULS_COUNTY'
                                            });

                                            process.stdout.write(`✅ MatchFound! (${structureType}) @ ${lat.toFixed(4)}, ${lon.toFixed(4)}\n`);
                                            siteFound = true;
                                            break; // Found one location, move to next Call Sign
                                        }
                                    }
                                }

                                if (!siteFound) {
                                    process.stdout.write(`⏩ No valid sites in ${foundLocations.length} locations examined.\n`);
                                }
                                // --- END REVISED EXTRACTION ---
                            } catch (itemErr) {
                                process.stdout.write(`❌ Error analyzing ${item.callSign}: ${itemErr.message}\n`);
                            }
                        }
                    }

                    // Call Progress Callback after successful page analysis
                    if (options.onPageProgress) {
                        await options.onPageProgress(pageNum);
                    }

                    const nextBtn = page.locator('a[title="Next page of results"]').first();
                    if (await nextBtn.isVisible()) {
                        if (pageNum >= startPage) {
                            console.log(`[FCC-County] ➡️ Moving to page ${pageNum + 1}...`);
                        }
                        await nextBtn.click();
                        // DomContentLoaded is MUCH faster for ULS which is mostly text
                        await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
                        
                        // NO SLEEP if fast-forwarding. 100ms if active scanning.
                        const sleepTime = pageNum < startPage ? 0 : 100;
                        if (sleepTime > 0) await page.waitForTimeout(sleepTime);
                        
                        pageNum++;
                    } else {
                        break;
                    }
                }
                return results;
            } finally {
                try {
                    if (context && context.browser()?.isConnected()) {
                        await context.close();
                    }
                } catch (e) {}
            }

        } catch (err: any) {
            console.error(`[FCC-County] 🚨 Critical Failure: ${err.message}`);
            throw err;
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
                        await page.waitForTimeout(2000); // 2s is better for map tiles
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
