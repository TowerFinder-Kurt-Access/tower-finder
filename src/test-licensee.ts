import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

chromium.use(StealthPlugin());

async function run() {
    console.log('[TEST] Starting Licensee-to-County Pipeline...');
    
    const browser = await chromium.launch({
        headless: false,
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        args: ['--disable-blink-features=AutomationControlled']
    });

    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        // 1. Search Licensee by ID/Name
        console.log('[TEST] Searching for AT&T (New Cingular)...');
        await page.goto('https://wireless2.fcc.gov/UlsApp/UlsSearch/searchLicensee.jsp', { waitUntil: 'load' });
        await page.waitForTimeout(1000);

        await page.fill('input[name="fiLicenseeName"]', 'New Cingular Wireless PCS, LLC');
        await page.click('input[type="submit"][value="Search"]');

        await page.waitForLoadState('load');
        await page.waitForTimeout(3000);

        console.log('[TEST] Result URL:', page.url());
        await page.screenshot({ path: 'licensee_search_results.png', fullPage: true });

        // 2. Iterate Results and Look for Alameda (and Building if possible)
        // Note: The results page only shows Call Sign, Name, Status, State. 
        // Alameda is a county, so we need to click into the license or search for results that explicitly mention it.
        const rowTexts = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('table tr'));
            return rows.map(r => (r as HTMLElement).innerText);
        });

        const californiaRows = rowTexts.filter(t => t.includes('CA') || t.includes('California'));
        console.log(`[TEST] Found ${californiaRows.length} California-specific rows on the first page.`);

        if (californiaRows.length > 0) {
            console.log('[TEST] SUCCESS: Found potential licenses. Check results screenshot.');
        } else if (await page.innerText('body').then(t => t.includes('No matches found'))) {
             console.log('[TEST] NO MATCHES found for the exact name.');
        } else {
             console.log('[TEST] BLOCKED or unexpected results.');
        }

    } catch (err) {
        console.error('[TEST] ERROR:', err);
    } finally {
        await browser.close();
    }
}

run();
