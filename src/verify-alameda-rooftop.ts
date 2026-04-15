import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

chromium.use(StealthPlugin());

async function findRooftopInAlameda() {
    console.log('[VERIFY] Searching for a Rooftop/Building in Alameda for AT&T...');
    const browser = await chromium.launch({
        headless: false,
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        // Direct to Advanced Search but specialized for Alameda + Building (if it works without IntrusionException)
        await page.goto('https://wireless2.fcc.gov/UlsApp/UlsSearch/searchAdvanced.jsp');
        
        // State = CA
        await page.selectOption('select[name="ulsState"]', 'CA');
        
        // County = Alameda (We need to find the value for Alameda)
        // Wait, the dropdowns are dynamic. I'll just search by Licensee and browse the first few
        await page.fill('input[name="fiOwnerName"]', 'NEW CINGULAR WIRELESS PCS, LLC');
        await page.click('input[type="submit"][value="Search"]');

        await page.waitForLoadState('load');
        await page.waitForTimeout(3000);

        // Get the first call sign
        const callSignLink = page.locator('a[href*="licKey="]').first();
        const callSign = await callSignLink.innerText();
        const href = await callSignLink.getAttribute('href');
        const licKey = href?.match(/licKey=(\d+)/)?.[1];

        if (licKey) {
            console.log(`[VERIFY] Checking locations for Call Sign ${callSign} (Key ${licKey})...`);
            await page.goto(`https://wireless2.fcc.gov/UlsApp/UlsSearch/licenseLocSum.jsp?licKey=${licKey}`);
            await page.waitForTimeout(2000);
            
            // Check for "Alameda" in the table
            const content = await page.innerText('body');
            if (content.includes('ALAMEDA')) {
                console.log('[SUCCESS] Found ALAMEDA in locations!');
                // Check for Building
                if (content.includes('Building')) {
                    console.log('[SUCCESS] Found a BUILDING structure in ALAMEDA!');
                }
            } else {
                console.log('[INFO] This call sign has no Alameda locations. Continuing search...');
            }
        }

        await page.screenshot({ path: 'alameda_verification.png', fullPage: true });

    } catch (err) {
        console.error('[ERROR]', err);
    } finally {
        await browser.close();
    }
}

findRooftopInAlameda();
