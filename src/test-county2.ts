import { chromium } from 'playwright-extra';
// @ts-ignore
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

chromium.use(StealthPlugin());

async function runTest() {
    console.log('[FCC] Launching browser...');
    const executablePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const browser = await chromium.launch({ headless: true, executablePath });
    const page = await browser.newPage();

    console.log('[FCC] Navigating to Advanced Search...');
    await page.goto('https://wireless2.fcc.gov/UlsApp/UlsSearch/searchAdvanced.jsp', { waitUntil: 'load', timeout: 45000 });
    
    await page.evaluate(() => {
        const radios = document.querySelectorAll<HTMLInputElement>('input[name="searchStateCountyType"]');
        radios.forEach(r => { if(r.value === 'S') r.click(); });
    });
    
    await page.waitForTimeout(1000);

    await page.evaluate(() => {
        const _state = document.querySelector<HTMLSelectElement>('select[name="fiState"]');
        if (_state) {
            for (const opt of Array.from(_state.options)) {
                if (opt.text.includes('California') || opt.value === 'CA') opt.selected = true;
            }
            _state.dispatchEvent(new Event('change'));
        }
    });

    await page.waitForTimeout(4000); // Give it time to load counties via JS!

    await page.evaluate(() => {
        const _county = document.querySelector<HTMLSelectElement>('select[name="fiCounty"]');
        if (_county) {
            // Find "CA - Alameda" or similar
            for (const opt of Array.from(_county.options)) {
                if (opt.text.toLowerCase().includes('alameda')) {
                    opt.selected = true;
                    // Note: FCC sometimes uses "CAA" for CA - Alameda
                }
            }
        }
    });

    await page.fill('input[name="fiOwnerName"]', 'New Cingular*');
    
    await page.waitForTimeout(1000);
    console.log('[FCC] Submitting...');
    
    const searchBtns = await page.$$('input[type="submit"], input[alt="Search"], [name="Search"]');
    for (const btn of searchBtns) {
        if (await btn.getAttribute('value') === 'Search') {
            await btn.click();
            break;
        }
    }
    
    await page.waitForTimeout(3000); // Wait for page nav start
    await page.waitForLoadState('load');
    await page.waitForTimeout(2000);

    const text = await page.innerText('body');
    require('fs').writeFileSync('cali_results.txt', text);
    console.log('[FCC] Saved text to cali_results.txt');
    await browser.close();
}
runTest().catch(console.error);
