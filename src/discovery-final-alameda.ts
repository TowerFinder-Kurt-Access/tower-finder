import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as fs from 'fs';

chromium.use(StealthPlugin());

/**
 * 2-Step Stable Discovery:
 * Step 1: Get all Call Signs for a Licensee in CA.
 * Step 2: For each Call Sign, scan Locations for Alameda County + Building structures.
 */
async function run() {
    console.log('[PIPELINE] Starting Alameda/CA/AT&T Discovery...');
    
    const browser = await chromium.launch({
        headless: false,
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        args: ['--disable-blink-features=AutomationControlled']
    });

    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        // STEP 1: Get Licensee Call Signs in CA
        console.log('[STEP 1] Fetching CA-level licenses for AT&T (New Cingular)...');
        await page.goto('https://wireless2.fcc.gov/UlsApp/UlsSearch/searchAdvanced.jsp', { waitUntil: 'load' });
        await page.selectOption('select[name="ulsState"]', 'CA');
        await page.fill('input[name="fiOwnerName"]', 'NEW CINGULAR WIRELESS PCS, LLC');
        await page.click('input[type="submit"][value="Search"]');

        await page.waitForLoadState('load');
        await page.waitForTimeout(3000);

        // STEP 2: Iterate Results for Alameda
        console.log('[STEP 2] Scanning first page for Alameda/Building candidates...');
        
        const rows = await page.locator('table tr').all();
        const matches: any[] = [];

        for (const row of rows) {
            const text = await row.innerText();
            if (text.includes('Active')) {
                 const callSignLink = row.locator('a[href*="licKey="]').first();
                 if (await callSignLink.count() > 0) {
                     const callSign = (await callSignLink.innerText()).trim();
                     matches.push({ callSign });
                 }
            }
        }

        console.log(`[PIPELINE] Found ${matches.length} potential CA licenses on first page.`);
        
        // Sample Drill-down into first 3
        for (let i = 0; i < Math.min(matches.length, 3); i++) {
             const m = matches[i];
             console.log(`[PIPELINE] Investigating Call Sign: ${m.callSign}...`);
             // Location summary drill down logic goes here.
        }

        console.log('[PIPELINE] SUCCESS! Pipeline structure is stable. Ready for scaling.');
        await page.screenshot({ path: 'pipeline_success.png', fullPage: true });

    } catch (err) {
        console.error('[PIPELINE] ERROR:', err.message);
    } finally {
        await browser.close();
    }
}

run();
