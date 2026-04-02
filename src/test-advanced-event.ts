import { chromium } from 'playwright-extra';
// @ts-ignore
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as fs from 'fs';

chromium.use(StealthPlugin());

async function runTest() {
    console.log('[FCC] Debugging Advanced Search with Explicit Event...');
    const browser = await chromium.launch({ 
        headless: false,
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    });
    const page = await browser.newPage();
    
    try {
        await page.goto('https://wireless2.fcc.gov/UlsApp/UlsSearch/searchAdvanced.jsp', { waitUntil: 'load', timeout: 60000 });
        
        console.log('[FCC] Selecting State (IL)...');
        await page.selectOption('select[name="ulsState"]', 'IL');
        // Manually trigger change event just in case
        await page.dispatchEvent('select[name="ulsState"]', 'change');

        console.log('[FCC] Waiting for County options...');
        // Wait until there's at least one option with a value that looks like a county FIPS (5 digits)
        await page.waitForFunction(() => {
            const select = document.querySelector('select[name="ulsCounty"]') as HTMLSelectElement;
            return select && select.options.length > 1;
        }, { timeout: 10000 });

        const count = await page.locator('select[name="ulsCounty"] option').count();
        console.log(`[FCC] Found ${count} counties.`);
        
        await page.selectOption('select[name="ulsCounty"]', '17031');

        await page.fill('input[name="fiOwnerName"]', 'New Cingular*');
        await page.fill('input[name="fiStructure"]', 'B');

        await page.screenshot({ path: 'advanced_pre_submit_event.png' });
        
        console.log('[FCC] Submitting...');
        await page.click('input[name="SUBMIT"]');
        
        await page.waitForTimeout(10000);
        console.log('[FCC] Current URL:', page.url());
        
        await page.screenshot({ path: 'advanced_post_submit_event.png', fullPage: true });

    } catch (e) {
        console.error('[FCC] Debug Error:', e.message);
    }
    
    await browser.close();
    console.log('[FCC] Debug END. - Explicit Event');
}

runTest();
