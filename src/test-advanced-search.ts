import { chromium } from 'playwright-extra';
// @ts-ignore
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as fs from 'fs';

chromium.use(StealthPlugin());

async function runTest() {
    console.log('[FCC] Testing Advanced License Search...');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    try {
        console.log('[FCC] Navigating to Advanced Search...');
        const resp = await page.goto('https://wireless2.fcc.gov/UlsApp/UlsSearch/searchAdvanced.jsp', { waitUntil: 'load', timeout: 30000 });
        console.log('[FCC] Status:', resp?.status());

        // 1. STATE Selection (California)
        console.log('[FCC] Selecting California...');
        await page.selectOption('select[name="ulsState"]', { value: 'CA' });
        
        // 2. WAIT for County population (if applicable)
        console.log('[FCC] Selecting Alameda County (06001)...');
        // On advanced search, the county list might not populate until state is selected.
        await page.waitForTimeout(2000); 
        await page.selectOption('select[name="ulsCounty"]', { value: '06001' });

        // 3. LICENSEE NAME (New Cingular*)
        console.log('[FCC] Entering Licensee Name...');
        await page.fill('input[name="fiOwnerName"]', 'New Cingular*');

        // 4. STRUCTURE TYPE (Building)
        console.log('[FCC] Entering Structure Type...');
        // In the HTML I saw "Structure" is a text input for type code?
        // Let's assume it's fiStructure.
        await page.fill('input[name="fiStructure"]', 'B');

        await page.screenshot({ path: 'before_submit_advanced.png', fullPage: true });

        // 5. SUBMIT
        console.log('[FCC] Submitting...');
        await page.click('input[name="SUBMIT"]');
        
        await page.waitForTimeout(5000);
        console.log('[FCC] Navigated to:', page.url());
        
        const html = await page.content();
        fs.writeFileSync('advanced_results.html', html);
        await page.screenshot({ path: 'after_submit_advanced.png', fullPage: true });

    } catch (e) {
        console.error('[FCC] Advanced Search Error:', e.message);
    }
    
    await browser.close();
    console.log('[FCC] Advanced Search END.');
}

runTest();
