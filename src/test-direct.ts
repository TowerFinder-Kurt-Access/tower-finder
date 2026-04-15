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
    
    const browser = await chromium.launch({ 
        headless: true, 
        executablePath,
        args: ['--disable-blink-features=AutomationControlled']
    });
    const page = await browser.newPage();

    console.log('[FCC] Trying direct results URL...');
    // I need to find the correct parameter names. Usually, they matched the 'name' attributes on the form.
    // Based on searchAdvanced.jsp:
    // fiOwnerName = New Cingular*
    // fiState = CA
    // fiCounty = CAA (Alameda is often CAA, but let's check)
    // searchStateCountyType = S
    
    // Constructing search URL
    const params = new URLSearchParams();
    params.set('searchStateCountyType', 'S');
    params.set('fiState', 'CA');
    params.set('fiCounty', 'CAA');
    params.set('fiOwnerName', 'New Cingular*');
    params.set('resultsDisplay', '100'); // Let's grab more at once
    
    const url = `https://wireless2.fcc.gov/UlsApp/UlsSearch/results.jsp?${params.toString()}`;
    console.log('[FCC] Navigating to: ' + url);
    
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(5000);
    
    await page.screenshot({ path: 'direct_url_result.png', fullPage: true });

    const bodyText = await page.innerText('body');
    if (bodyText.includes('FCC Website Error')) {
        console.log('[FCC] Direct URL also BLOCKED');
    } else if (bodyText.includes('No matches found')) {
        console.log('[FCC] Direct URL: No matches found. Maybe parameters are wrong.');
    } else {
        console.log('[FCC] Direct URL: SUCCESS! (Maybe)');
        const found = await page.locator('table').count();
        console.log(`[FCC] Found ${found} tables.`);
    }

    await browser.close();
}

runTest().catch((e) => {
    console.error(e);
    process.exit(1);
});
