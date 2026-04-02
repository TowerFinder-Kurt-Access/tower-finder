import { chromium } from 'playwright-extra';
// @ts-ignore
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as fs from 'fs';

chromium.use(StealthPlugin());

async function runTest() {
    console.log('[FCC] Debugging Form BEGIN...');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    try {
        console.log('[FCC] Navigating to Advanced Search...');
        const resp = await page.goto('https://wireless2.fcc.gov/UlsApp/UlsSearch/searchAdvanced.jsp', { waitUntil: 'load', timeout: 30000 });
        console.log('[FCC] Status:', resp?.status());
        
        await page.waitForTimeout(5000); // Give it extra time for all scripts to run
        
        const html = await page.content();
        fs.writeFileSync('debug_page.html', html);
        console.log('[FCC] Wrote full page content to debug_page.html');
        
        const radios = await page.locator('input[name="searchStateCountyType"]').count();
        console.log(`[FCC] Found ${radios} radios for State/County search.`);
        
        await page.screenshot({ path: 'debug_initial.png', fullPage: true });
        
        if (radios > 0) {
            console.log('[FCC] Clicking radio...');
            await page.click('input[name="searchStateCountyType"][value="S"]');
            await page.waitForTimeout(2000);
            
            const countySel = await page.locator('select[name="fiCounty"]').count();
            console.log(`[FCC] County selector count: ${countySel}`);
        } else {
            console.log('[FCC] Form not found as expected. Page content might be different or blocked.');
        }

    } catch (e) {
        console.error('[FCC] Debug script error:', e.message);
    }
    
    await browser.close();
    console.log('[FCC] Debugging Form END.');
}

runTest();
