import { chromium } from 'playwright-extra';
// @ts-ignore
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as fs from 'fs';

chromium.use(StealthPlugin());

async function runTest() {
    console.log('[FCC] Debugging Geo Search with Real Chrome...');
    const browser = await chromium.launch({ 
        headless: false, // Run headed so we can see it if possible
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    });
    const page = await browser.newPage();
    
    try {
        console.log('[FCC] Navigating to Geographic Search...');
        const resp = await page.goto('https://wireless2.fcc.gov/UlsApp/UlsSearch/searchGeographic.jsp', { waitUntil: 'load', timeout: 60000 });
        console.log('[FCC] Status:', resp?.status());
        
        await page.waitForTimeout(10000); 
        
        const html = await page.content();
        fs.writeFileSync('debug_geo_real.html', html);
        await page.screenshot({ path: 'debug_geo_real.png', fullPage: true });

        // Try to find the radio for "State/County"
        // Wait, many FCC radios are inside tables.
        const radios = await page.locator('input[type="radio"]').count();
        console.log(`[FCC] Found ${radios} total radios.`);

    } catch (e) {
        console.error('[FCC] Debug Error:', e.message);
    }
    
    await browser.close();
    console.log('[FCC] Debug END.');
}

runTest();
