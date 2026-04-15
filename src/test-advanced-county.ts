import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as fs from 'fs';

chromium.use(StealthPlugin());

async function run() {
    console.log('[TEST] Starting Advanced Search County Pipeline...');
    
    // 1. Launch Real Chrome
    const browser = await chromium.launch({
        headless: false,
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        args: [
            '--disable-blink-features=AutomationControlled',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        ]
    });

    const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    });

    const page = await context.newPage();

    try {
        // 2. Navigate to Advanced Search
        console.log('[TEST] Navigating to Advanced Search...');
        await page.goto('https://wireless2.fcc.gov/UlsApp/UlsSearch/searchAdvanced.jsp', { 
            waitUntil: 'load', 
            timeout: 60000 
        });
        await page.waitForTimeout(3000);

        // 3. Select State: California (CA)
        console.log('[TEST] Selecting State: CA');
        await page.selectOption('select[name="ulsState"]', 'CA');
        await page.waitForTimeout(2000);

        // 4. Trigger County List Population (Legacy script call)
        console.log('[TEST] Triggering county population...');
        await page.evaluate(() => {
            // @ts-ignore
            if (typeof ulsStateSelected === 'function') {
                // @ts-ignore
                ulsStateSelected();
            }
        });
        await page.waitForTimeout(3000);

        // 5. Select County: Alameda (06001)
        console.log('[TEST] Selecting County: Alameda (06001)');
        await page.selectOption('select[name="ulsCounty"]', '06001');
        await page.waitForTimeout(1000);

        // 6. Filter by Licensee (AT&T = New Cingular*)
        console.log('[TEST] Filtering by Licensee: New Cingular*');
        await page.fill('input[name="fiOwnerName"]', 'New Cingular*');

        // 7. Filter by Structure: Building (B)
        console.log('[TEST] Filtering by Structure: Building (B)');
        await page.selectOption('select[name="fiStructure"]', 'B');

        // 8. Submit Search
        console.log('[TEST] Submitting search...');
        const searchBtn = page.locator('input[type="submit"][value="Search"]').first();
        await searchBtn.click();

        // 9. Wait for Results
        console.log('[TEST] Waiting for results page...');
        await page.waitForLoadState('load', { timeout: 60000 });
        await page.waitForTimeout(5000);

        // 10. Capture Results
        const currentUrl = page.url();
        console.log(`[TEST] Current URL: ${currentUrl}`);

        if (currentUrl.includes('results.jsp')) {
            console.log('[TEST] RESULTS FOUND! Capturing screenshot...');
            await page.screenshot({ path: 'county_search_results.png', fullPage: true });
            
            // Extract some Call Signs
            const callSigns = await page.evaluate(() => {
                const results: string[] = [];
                const links = document.querySelectorAll('a[href*="licKey="]');
                links.forEach(l => {
                    const text = (l as HTMLElement).innerText.trim();
                    if (text.length > 3) results.push(text);
                });
                return results;
            });

            console.log(`[TEST] Found ${callSigns.length} licenses in Alameda County for AT&T on Buildings.`);
            console.log(`[TEST] Sample Call Signs: ${callSigns.slice(0, 5).join(', ')}`);
        } else {
            console.log('[TEST] No results found or blocked.');
            await page.screenshot({ path: 'county_search_failed.png', fullPage: true });
            const body = await page.innerText('body');
            console.log('[TEST] Page snippet:', body.substring(0, 500));
        }

    } catch (err) {
        console.error('[TEST] ERROR:', err);
        await page.screenshot({ path: 'county_test_error.png' }).catch(() => {});
    } finally {
        // Keep browser open for a bit to see what happened if not in headless
        await page.waitForTimeout(10000);
        await browser.close();
    }
}

run();
