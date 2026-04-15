import { chromium } from 'playwright-extra';
// @ts-ignore
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as fs from 'fs';

chromium.use(StealthPlugin());

async function runTest() {
    console.log('[FCC] Testing direct results URL...');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    try {
        // Try to construct a results URL for California, Alameda
        const url = 'https://wireless2.fcc.gov/UlsApp/UlsSearch/results.jsp?searchStateCountyType=S&ulsState=CA&ulsCounty=06001&SUBMIT=Submit';
        
        console.log('[FCC] Navigating to:', url);
        const resp = await page.goto(url, { waitUntil: 'load', timeout: 60000 });
        console.log('[FCC] Status:', resp?.status());
        
        await page.waitForTimeout(10000); // Wait for results to load
        
        const html = await page.content();
        fs.writeFileSync('direct_results.html', html);
        await page.screenshot({ path: 'direct_results.png', fullPage: true });

        const matches = html.match(/Searching for State\/County matches found: (\d+)/i);
        if (matches) {
            console.log(`[FCC] Found results: ${matches[1]}`);
        } else {
            console.log('[FCC] No result count found on page.');
        }

    } catch (e) {
        console.error('[FCC] Direct Results Error:', e.message);
    }
    
    await browser.close();
    console.log('[FCC] Direct Results END.');
}

runTest();
