import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

chromium.use(StealthPlugin());

async function run() {
    console.log('[SANITY] Testing basic connectivity...');
    const browser = await chromium.launch({
        headless: true, // Try headless for once
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    });
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
        await page.goto('https://www.google.com', { waitUntil: 'load' });
        console.log('[SANITY] Google loaded!');
        await page.screenshot({ path: 'google_sanity.png' });
    } catch (err) {
        console.error('[SANITY] FAILED:', err.message);
    } finally {
        await browser.close();
    }
}
run();
