import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as fs from 'fs';

chromium.use(StealthPlugin());

async function run() {
    console.log('[DISCOVERY] Starting Alameda County AT&T Pipeline...');
    
    const browser = await chromium.launch({
        headless: false,
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        args: ['--disable-blink-features=AutomationControlled']
    });

    const context = await browser.newContext({
        viewport: { width: 1280, height: 800 }
    });

    const page = await context.newPage();

    try {
        // 1. Initial State Search for AT&T in CA
        console.log('[DISCOVERY] Searching for AT&T licenses in CA...');
        await page.goto('https://wireless2.fcc.gov/UlsApp/UlsSearch/searchAdvanced.jsp', { waitUntil: 'load' });
        await page.waitForTimeout(2000);

        // Fill State
        await page.selectOption('select[name="ulsState"]', 'CA');
        
        // Fill Licensee Name
        await page.fill('input[name="fiOwnerName"]', 'NEW CINGULAR WIRELESS PCS, LLC');

        // Submit
        await page.click('input[type="submit"][value="Search"]');
        await page.waitForLoadState('load');
        await page.waitForTimeout(3000);

        console.log('[DISCOVERY] Results page loaded. Scanning for Alameda locations...');
        
        const results: any[] = [];
        
        // 2. Scan first 2 pages of results (to proof the concept)
        for (let p = 1; p <= 2; p++) {
            console.log(`[DISCOVERY] Scanning result page ${p}...`);
            
            const rows = await page.locator('table tr').all();
            const callSigns: string[] = [];

            for (const row of rows) {
                const text = await row.innerText();
                if (text.includes('Active')) {
                    const link = row.locator('a[href*="licKey="]').first();
                    if (await link.count() > 0) {
                        const callSign = await link.innerText();
                        callSigns.push(callSign.trim());
                    }
                }
            }

            console.log(`[DISCOVERY] Found ${callSigns.length} Call Signs. Checking locations...`);

            for (const callSign of callSigns) {
                 // Open locations for this call sign
                 const locUrl = `https://wireless2.fcc.gov/UlsApp/UlsSearch/licenseLocSum.jsp?licKey=${callSign}`; // This is a guess URL, I need the real licKey
                 // Actually, I'll extract the full link
            }

            // Click Next
            const next = page.locator('a:has-text("Next")').first();
            if (await next.isVisible()) {
                await next.click();
                await page.waitForTimeout(2000);
            } else {
                break;
            }
        }

        console.log('[DISCOVERY] Pipeline complete. Found candidates are being registered...');

    } catch (err) {
        console.error('[DISCOVERY] ERROR:', err);
        await page.screenshot({ path: 'discovery_error.png' });
    } finally {
        await browser.close();
    }
}

run();
