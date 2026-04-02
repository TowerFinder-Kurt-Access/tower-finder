import { chromium } from 'playwright-extra';
// @ts-ignore
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as fs from 'fs';

chromium.use(StealthPlugin());

async function runTest() {
    console.log('[FCC] Debugging Advanced Search with JS injection...');
    const browser = await chromium.launch({ 
        headless: false,
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    });
    const page = await browser.newPage();
    
    try {
        await page.goto('https://wireless2.fcc.gov/UlsApp/UlsSearch/searchAdvanced.jsp', { waitUntil: 'load', timeout: 60000 });
        
        console.log('[FCC] Selecting State (IL) via JS...');
        await page.evaluate(() => {
            const stateSel = document.querySelector('select[name="ulsState"]') as HTMLSelectElement;
            stateSel.value = 'IL';
            // @ts-ignore
            ulsStateSelected(stateSel, document.querySelector('select[name="ulsCounty"]'), codesArray);
        });

        const count = await page.locator('select[name="ulsCounty"] option').count();
        console.log(`[FCC] Found ${count} counties after JS call.`);
        
        if (count > 0) {
            await page.selectOption('select[name="ulsCounty"]', '17031');
        }

        await page.fill('input[name="fiOwnerName"]', 'New Cingular*');
        await page.fill('input[name="fiStructure"]', 'B');

        await page.screenshot({ path: 'advanced_js_pre.png' });
        
        console.log('[FCC] Submitting...');
        await page.click('input[name="SUBMIT"]');
        
        await page.waitForTimeout(10000);
        console.log('[FCC] Current URL:', page.url());
        
        await page.screenshot({ path: 'advanced_js_post.png', fullPage: true });

    } catch (e) {
        console.error('[FCC] Debug Error:', e.message);
    }
    
    await browser.close();
    console.log('[FCC] Debug END. - JS Injection');
}

runTest();
