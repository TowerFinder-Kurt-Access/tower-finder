import { chromium } from 'playwright-extra';
// @ts-ignore
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as fs from 'fs';

chromium.use(StealthPlugin());

async function runTest() {
    console.log('[FCC] Launching browser...');
    const chromePaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    ];
    const executablePath = chromePaths.find(p => fs.existsSync(p)) || undefined;
    
    // Attempt with headed if user sets it, otherwise headless
    const isHeaded = process.env.FCC_HEADED === '1';
    const browser = await chromium.launch({ 
        headless: !isHeaded, 
        executablePath,
        args: [
            '--disable-blink-features=AutomationControlled',
            '--no-sandbox',
            '--disable-setuid-sandbox'
        ]
    });
    
    // Use a realistic user agent if possible, though Playwright-extra handles some of this
    const context = await browser.newContext({
        viewport: { width: 1280, height: 720 }
    });
    const page = await context.newPage();

    console.log('[FCC] Navigating to Advanced Search...');
    await page.goto('https://wireless2.fcc.gov/UlsApp/UlsSearch/searchAdvanced.jsp', { waitUntil: 'networkidle', timeout: 60000 });
    
    // Human-like click helper
    async function humanClick(selector: string) {
        const loc = page.locator(selector).first();
        await loc.scrollIntoViewIfNeeded();
        const box = await loc.boundingBox();
        if (!box) {
            console.log(`[FCC] Could not find box for ${selector}, trying direct click...`);
            await loc.click({ force: true });
            return;
        }
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 10 });
        await page.waitForTimeout(100);
        await page.mouse.down();
        await page.waitForTimeout(50);
        await page.mouse.up();
    }

    console.log('[FCC] Selecting State/County radio...');
    await humanClick('input[name="searchStateCountyType"][value="S"]');
    await page.waitForTimeout(1500);

    console.log('[FCC] Choosing California...');
    await page.selectOption('select[name="fiState"]', { label: 'California' });
    
    console.log('[FCC] Waiting for County options to populate...');
    // Wait for the county dropdown to have more than just "Select a state first" or "All"
    await page.waitForFunction(() => {
        const sel = document.querySelector('select[name="fiCounty"]') as HTMLSelectElement;
        return sel && sel.options.length > 5;
    }, { timeout: 10000 }).catch(() => console.log('[FCC] County list didn\'t populate as expected, continuing anyway...'));

    console.log('[FCC] Choosing Alameda...');
    try {
        await page.selectOption('select[name="fiCounty"]', { label: 'CA - Alameda' });
    } catch (e) {
        console.log('[FCC] Could not select Alameda by label, trying value lookup...');
        await page.evaluate(() => {
            const sel = document.querySelector('select[name="fiCounty"]') as HTMLSelectElement;
            for (let i = 0; i < sel.options.length; i++) {
                if (sel.options[i].text.includes('Alameda')) {
                    sel.selectedIndex = i;
                    sel.dispatchEvent(new Event('change'));
                    break;
                }
            }
        });
    }
    
    await page.waitForTimeout(1000);

    console.log('[FCC] Typing Name...');
    const nameInput = 'input[name="fiOwnerName"]';
    await humanClick(nameInput);
    await page.keyboard.type('New Cingular', { delay: 100 });
    await page.keyboard.press('Shift+8'); // The asterisk *
    await page.waitForTimeout(1500);

    console.log('[FCC] Clicking Search button...');
    // Let's try to find precisely the search button. It's often an image input.
    const searchButtonSelector = 'input[alt="Search"], input[value="Search"], input[type="submit"][name="Search"], img[alt="Search"]';
    
    await page.screenshot({ path: 'ready_to_search.png' });
    
    try {
        await humanClick(searchButtonSelector);
    } catch (e) {
        console.log('[FCC] Precision click failed, trying standard click...');
        await page.click(searchButtonSelector, { timeout: 5000 }).catch(() => {
            console.log('[FCC] Standard click failed, submitting form...');
            return page.evaluate(() => (document.forms[0] as HTMLFormElement).submit());
        });
    }

    console.log('[FCC] Waiting for results page navigation...');
    await page.waitForLoadState('load', { timeout: 30000 }).catch(() => console.log('[FCC] Load state wait timed out'));
    await page.waitForTimeout(5000); // Wait for potential late-loading tables

    const bodyText = await page.innerText('body');
    fs.writeFileSync('last_run_body.txt', bodyText);

    if (bodyText.includes('FCC Website Error')) {
        console.log('[FCC] Result: BLOCKED with Website Error');
        await page.screenshot({ path: 'blocked_error.png', fullPage: true });
    } else if (bodyText.includes('No matches found')) {
        console.log('[FCC] Result: No matches found for these criteria');
        await page.screenshot({ path: 'no_matches.png', fullPage: true });
    } else {
        console.log('[FCC] Result: SUCCESS! Reached results or redirected. Current URL: ' + page.url());
        await page.screenshot({ path: 'search_success.png', fullPage: true });
        
        // Count result table rows
        const rows = await page.locator('table tr').count();
        console.log(`[FCC] Found roughly ${rows} rows in tables.`);
    }

    await browser.close();
}

runTest().catch((e) => {
    console.error('[FCC] Script fatal error:', e);
    process.exit(1);
});
