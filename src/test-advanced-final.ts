import { chromium } from 'playwright-extra';
// @ts-ignore
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as fs from 'fs';

chromium.use(StealthPlugin());

async function runTest() {
    console.log('[FCC] Final Debug - Advanced Search Page...');
    const browser = await chromium.launch({ 
        headless: false,
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    });
    const page = await browser.newPage();
    
    try {
        await page.goto('https://wireless2.fcc.gov/UlsApp/UlsSearch/searchAdvanced.jsp', { waitUntil: 'load', timeout: 60000 });
        
        console.log('[FCC] Selecting State (IL)...');
        await page.selectOption('select[name="ulsState"]', 'IL');
        // The script on the page for onchange is:
        // ulsStateSelected(this,form.ulsCounty,codesArray);setRadioValue(searchType,'UGCOUNTY');
        
        await page.dispatchEvent('select[name="ulsState"]', 'change');

        console.log('[FCC] Waiting for County options...');
        await page.waitForFunction(() => {
            const select = document.querySelector('select[name="ulsCounty"]') as HTMLSelectElement;
            return select && select.options.length > 1;
        }, { timeout: 10000 });

        console.log('[FCC] Found counties!');
        await page.selectOption('select[name="ulsCounty"]', '17031');

        console.log('[FCC] Entering Licensee Name (New Cingular*)...');
        await page.fill('input[name="fiOwnerName"]', 'New Cingular*');

        console.log('[FCC] Entering Structure Type (B)...');
        await page.fill('input[name="fiStructure"]', 'B');

        await page.screenshot({ path: 'advanced_final_pre.png' });
        
        console.log('[FCC] Submitting...');
        // On advanced search, the submit is named SUBMIT
        await page.click('input[name="SUBMIT"]');
        
        await page.waitForTimeout(10000);
        console.log('[FCC] Current URL:', page.url());
        
        await page.screenshot({ path: 'advanced_final_post.png', fullPage: true });

    } catch (e) {
        console.error('[FCC] Debug Error:', e.message);
    }
    
    await browser.close();
    console.log('[FCC] Debug END. - Advanced Final');
}

runTest();
