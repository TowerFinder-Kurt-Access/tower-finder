import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

chromium.use(StealthPlugin());

async function run() {
    console.log('[TEST] Starting ASR Advanced Search (Alameda, CA)...');
    
    const browser = await chromium.launch({
        headless: false,
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        args: ['--disable-blink-features=AutomationControlled']
    });

    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        // 1. Go to ASR Search
        await page.goto('https://wireless2.fcc.gov/UlsApp/AsrSearch/asrAdvancedSearch.jsp', { waitUntil: 'load' });
        await page.waitForTimeout(2000);

        // 2. Select State
        console.log('[TEST] Selecting State: CA');
        await page.selectOption('select[name="ulsState"]', 'CA');
        await page.waitForTimeout(2000);

        // 3. Select County
        console.log('[TEST] Selecting County: Alameda (06001)');
        // Note: In ASR page, the selector might have different ID/Name or requires AJAX
        await page.selectOption('select[name="ulsCounty"]', '06001').catch(e => console.log('County select failed, trying evaluate...', e.message));
        
        // 4. Owner Name
        console.log('[TEST] Entering Owner: New Cingular'); // Try without wildcard first
        await page.fill('input[name="fiOwnerName"]', 'New Cingular');

        // 5. Structure Type: Building
        console.log('[TEST] Selecting Structure: Building');
        // ASR structure types are often different codes. Let's try 'B' or 'BUILD'
        await page.selectOption('select[name="fiStructure"]', 'B').catch(() => {});

        // 6. Submit
        console.log('[TEST] Submitting...');
        await page.click('input[type="submit"][value="Search"]');
        await page.waitForLoadState('load');
        await page.waitForTimeout(5000);

        console.log('[TEST] Current URL:', page.url());
        await page.screenshot({ path: 'asr_results.png', fullPage: true });

        const content = await page.innerText('body');
        if (content.includes('IntrusionException')) {
            console.log('[TEST] BLOCKED by IntrusionException');
        } else if (content.includes('No matches found')) {
            console.log('[TEST] NO MATCHES found.');
        } else {
            console.log('[TEST] SUCCESS? Check asr_results.png');
        }

    } catch (err) {
        console.error('[TEST] ERROR:', err);
    } finally {
        await browser.close();
    }
}

run();
