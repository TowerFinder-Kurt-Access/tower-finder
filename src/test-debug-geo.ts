import { chromium } from 'playwright-extra';
// @ts-ignore
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as fs from 'fs';

chromium.use(StealthPlugin());

async function runTest() {
    console.log('[FCC] Debugging Geographic Search BEGIN...');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    try {
        console.log('[FCC] Navigating to Geographic Search...');
        const resp = await page.goto('https://wireless2.fcc.gov/UlsApp/UlsSearch/searchGeographic.jsp', { waitUntil: 'load', timeout: 30000 });
        console.log('[FCC] Status:', resp?.status());
        
        await page.waitForTimeout(5000); 
        
        const html = await page.content();
        fs.writeFileSync('debug_geo.html', html);
        console.log('[FCC] Wrote full page content to debug_geo.html');
        
        // Find "State/County"
        const stateCountyRadios = await page.locator('input[name="searchStateCountyType"]').count();
        console.log(`[FCC] Found ${stateCountyRadios} State/County radios.`);
        
        if (stateCountyRadios > 0) {
            const radio = page.locator('input[name="searchStateCountyType"][value="S"]');
            await radio.click();
            await page.waitForTimeout(2000); 
            console.log('[FCC] Clicked State/County radio.');
        }

        await page.screenshot({ path: 'debug_geo_initial.png', fullPage: true });

    } catch (e) {
        console.error('[FCC] Debug script error:', e.message);
    }
    
    await browser.close();
    console.log('[FCC] Debugging Geographic Search END.');
}

runTest();
