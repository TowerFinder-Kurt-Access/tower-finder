import { chromium } from 'playwright-extra';
// @ts-ignore
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as fs from 'fs';

chromium.use(StealthPlugin());

async function runTest() {
    console.log('[FCC] Debugging Advanced Search with Real Chrome...');
    const browser = await chromium.launch({ 
        headless: false,
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    });
    const page = await browser.newPage();
    
    try {
        console.log('[FCC] Navigating to Advanced Search...');
        await page.goto('https://wireless2.fcc.gov/UlsApp/UlsSearch/searchAdvanced.jsp', { waitUntil: 'load', timeout: 60000 });
        
        console.log('[FCC] Selecting State (IL)...');
        await page.selectOption('select[name="ulsState"]', 'IL');
        
        // Wait for AJAX/Partial reload
        console.log('[FCC] Waiting for County list...');
        await page.waitForTimeout(5000);
        
        const count = await page.locator('select[name="ulsCounty"] option').count();
        console.log(`[FCC] Found ${count} counties.`);
        
        if (count > 1) {
            console.log('[FCC] Selecting Cook County (17031)...');
            await page.selectOption('select[name="ulsCounty"]', '17031');
        }

        console.log('[FCC] Entering Licensee Name...');
        await page.fill('input[name="fiOwnerName"]', 'New Cingular*');

        console.log('[FCC] Entering Structure Type...');
        await page.fill('input[name="fiStructure"]', 'B');

        await page.screenshot({ path: 'advanced_pre_submit.png' });
        
        console.log('[FCC] Submitting...');
        await page.click('input[name="SUBMIT"]');
        
        await page.waitForTimeout(10000);
        console.log('[FCC] Current URL:', page.url());
        
        await page.screenshot({ path: 'advanced_post_submit.png', fullPage: true });

    } catch (e) {
        console.error('[FCC] Debug Error:', e.message);
    }
    
    await browser.close();
    console.log('[FCC] Debug END.');
}

runTest();
