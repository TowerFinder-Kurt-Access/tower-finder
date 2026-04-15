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
    
    // Evaluate in browser to click the radio button, and critically, call the inline JS if needed
    console.log('[FCC] Selecting State/County radio...');
    await page.evaluate(() => {
        const radios = document.querySelectorAll<HTMLInputElement>('input[name="searchStateCountyType"]');
        for (let i = 0; i < radios.length; i++) {
            if (radios[i].value === 'S') {
                radios[i].click();
                // trigger change
                radios[i].dispatchEvent(new Event('change'));
            }
        }
    });

    await page.waitForTimeout(2000);

    console.log('[FCC] Setting State to CA and County to Alameda...');
    await page.evaluate(() => {
        const _state = document.querySelector<HTMLSelectElement>('select[name="fiState"]');
        if (_state) {
            for (let i = 0; i < _state.options.length; i++) {
                if (_state.options[i].text.includes('California') || _state.options[i].value === 'CA') {
                    _state.options[i].selected = true;
                }
            }
            _state.dispatchEvent(new Event('change'));
            console.log('State changed in DOM');
        }
    });

    await page.waitForTimeout(4000); // Give it time to load counties via JS!

    await page.evaluate(() => {
        const _county = document.querySelector<HTMLSelectElement>('select[name="fiCounty"]');
        if (_county) {
            let found = false;
            for (let i = 0; i < _county.options.length; i++) {
                if (_county.options[i].text.toLowerCase().includes('alameda') || _county.options[i].value.includes('CA-Alameda')) {
                    _county.options[i].selected = true;
                    found = true;
                }
            }
            if(!found && _county.options.length > 2) {
                // just pick the first actual county
                _county.options[2].selected = true;
            }
            _county.dispatchEvent(new Event('change'));
        }
    });

    await page.fill('input[name="fiOwnerName"]', 'New Cingular*');
    
    console.log('[FCC] Taking screenshot BEFORE submit...');
    await page.screenshot({ path: 'before_submit.png' });
    
    await page.waitForTimeout(1000);
    console.log('[FCC] Submitting...');
    
    await Promise.all([
        page.waitForNavigation({ waitUntil: 'load', timeout: 30000 }).catch(()=>console.log("Nav timeout")),
        page.evaluate(() => {
           // Click the exact image button 
           const btn = document.querySelector('img[alt="Search"]') || document.querySelector('input[value="Search"]');
           if (btn) (btn as HTMLElement).click();
           else document.forms[0].submit();
        })
    ]);

    await page.waitForTimeout(3000);

    const dsText = await page.innerText('body');
    require('fs').writeFileSync('cali_results.txt', dsText);
    
    // Check if table has results
    const count = await page.locator('table').count();
    console.log(`[FCC] Found ${count} tables on results page.`);
    
    await page.screenshot({ path: 'after_submit.png' });
    
    await browser.close();
}
runTest().catch(console.error);
