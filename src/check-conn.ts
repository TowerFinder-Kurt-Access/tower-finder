import { chromium } from 'playwright-extra';
// @ts-ignore
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as fs from 'fs';

chromium.use(StealthPlugin());

async function runTest() {
    console.log('[FCC] Check connection BEGIN...');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    try {
        const resp = await page.goto('https://wireless2.fcc.gov/UlsApp/UlsSearch/searchAdvanced.jsp', { 
            waitUntil: 'load', 
            timeout: 30000 
        });
        if (resp) {
            console.log('[FCC] Status:', resp.status());
            const text = await page.innerText('body');
            console.log('[FCC] Body prefix: ' + text.substring(0, 50).replace(/\n/g, ' '));
        } else {
            console.log('[FCC] No response!');
        }
    } catch (e) {
        console.error('[FCC] Connection test failed:', e.message);
    }
    await browser.close();
    console.log('[FCC] Check connection END.');
}
runTest();
