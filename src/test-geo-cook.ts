import { chromium } from 'playwright-extra';
// @ts-ignore
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as fs from 'fs';

chromium.use(StealthPlugin());

async function runTest() {
    console.log('[FCC] Debugging Geo Search - State/County Flow...');
    const browser = await chromium.launch({ 
        headless: false,
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    });
    const page = await browser.newPage();
    
    try {
        await page.goto('https://wireless2.fcc.gov/UlsApp/UlsSearch/searchGeographic.jsp', { waitUntil: 'load', timeout: 60000 });
        
        console.log('[FCC] Clicking State/County radio...');
        await page.click('input[name="searchType"][value="UGCOUNTY"]');

        console.log('[FCC] Selecting State (IL)...');
        await page.selectOption('select[name="countyState"]', 'IL');
        await page.dispatchEvent('select[name="countyState"]', 'change');

        console.log('[FCC] Waiting for County options...');
        await page.waitForFunction(() => {
            const select = document.querySelector('select[name="ulsCounty"]') as HTMLSelectElement;
            return select && select.options.length > 1;
        }, { timeout: 10000 });

        console.log('[FCC] Selecting Cook County (17031)...');
        await page.selectOption('select[name="ulsCounty"]', '17031');

        await page.screenshot({ path: 'geo_pre_submit_cook.png' });
        
        console.log('[FCC] Submitting...');
        await page.click('input[type="image"][alt="Search"]');
        
        await page.waitForTimeout(10000);
        console.log('[FCC] Current URL:', page.url());
        
        await page.screenshot({ path: 'geo_post_submit_cook.png', fullPage: true });

    } catch (e) {
        console.error('[FCC] Debug Error:', e.message);
    }
    
    await browser.close();
    console.log('[FCC] Debug END. - Geo Flow');
}

runTest();
