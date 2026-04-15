import { chromium } from 'playwright-extra';
// @ts-ignore
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

chromium.use(StealthPlugin());

async function runTest() {
    const isHeaded = process.env.FCC_HEADED === '1';
    
    // Default to the user's primary Chrome install to blend in
    const executablePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

    console.log('[FCC] Launching browser...');
    const browser = await chromium.launch({ 
        headless: !isHeaded,
        executablePath,
        args: ['--disable-blink-features=AutomationControlled']
    });

    const context = await browser.newContext();
    const page = await context.newPage();

    console.log('[FCC] Navigating to Advanced Search...');
    await page.goto('https://wireless2.fcc.gov/UlsApp/UlsSearch/searchAdvanced.jsp', { waitUntil: 'load', timeout: 45000 });
    await page.waitForTimeout(2000);

    console.log('[FCC] Selecting State/County radio...');
    
    // Evaluate in browser to click the radio button
    await page.evaluate(() => {
        const radios = document.querySelectorAll<HTMLInputElement>('input[name="searchStateCountyType"]');
        for (const r of Array.from(radios)) {
            if (r.value === 'S') {
                r.click();
            }
        }
    });
    await page.waitForTimeout(1000);

    console.log('[FCC] Setting State to CA and County to CA - Alameda...');
    await page.evaluate(() => {
        const _state = document.querySelector<HTMLSelectElement>('select[name="fiState"]');
        if (_state) {
            for (const opt of Array.from(_state.options)) {
                if (opt.text.includes('California') || opt.value === 'CA') opt.selected = true;
            }
            _state.dispatchEvent(new Event('change'));
        }

        const _county = document.querySelector<HTMLSelectElement>('select[name="fiCounty"]');
        if (_county) {
            for (const opt of Array.from(_county.options)) {
                if (opt.text.includes('Alameda') || opt.value.includes('CA-Alameda')) opt.selected = true;
            }
        }
    });

    console.log('[FCC] Entering Licensee Name...');
    await page.fill('input[name="fiOwnerName"]', 'New Cingular*');
    await page.waitForTimeout(1000);

    console.log('[FCC] Submitting Search...');
    // Click exactly the search button using playwright locators
    var searchBtns = await page.$$('input[type="submit"], input[alt="Search"], [name="Search"]');
    var didClick = false;
    for (const btn of searchBtns) {
        const alt = await btn.getAttribute('alt');
        const val = await btn.getAttribute('value');
        if ((alt && alt.includes('Search')) || (val && val.includes('Search'))) {
            await btn.click();
            didClick = true;
            break;
        }
    }
    
    if(!didClick) {
        console.log('[FCC] Search button not found by standard match, submitting form directly...');
        await page.evaluate(() => document.forms[0].submit());
    }

    console.log('[FCC] Waiting for results...');
    await page.waitForTimeout(4000); // 4 extra seconds since FCC is slow right now
    await page.waitForLoadState('load');

    console.log('[FCC] Current URL:', page.url());
    
    // Let's grab the HTML of the results table
    const tableHTML = await page.evaluate(() => {
        const tables = document.querySelectorAll('table');
        for (const t of Array.from(tables)) {
            if (t.innerText.includes('Call Sign') || t.innerText.includes('Licensee Name')) {
                return t.outerHTML;
            }
        }
        return 'No table found containing Call Sign';
    });

    require('fs').writeFileSync('cali_results.html', tableHTML);
    console.log('[FCC] Dumped table to cali_results.html');
    
    await page.screenshot({ path: 'county_search_results.png', fullPage: true });

    await browser.close();
}

runTest().catch(console.error);
