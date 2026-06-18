/**
 * iHunter Web Landowner Scraper (Playwright)
 *
 * Looks up each tower's coordinates on web.ihunterapp.com, reads the landowner
 * name from the parcel overlay, captures two screenshots, and saves everything
 * to the Owner + Parcel tables. Per-county runs are tracked in IHunterMapRun.
 *
 * Requires purchased iHunter landowner maps for the target counties.
 *
 * ── Auth ──────────────────────────────────────────────────────────────────────
 * iHunter web uses Google SSO, which blocks scripted login. We use a PERSISTENT
 * browser profile: log in via Google ONCE in a headed window, the session is
 * saved to scripts/.ihunter-profile/, and every later run reuses it.
 *
 * ── Commands ───────────────────────────────────────────────────────────────────
 *   login                          one-time interactive Google login
 *   inspect                        dump candidate selectors for calibration
 *   register --county "<name>"     add a county to the run registry
 *   status                         print the run registry (counties + run counts)
 *   run --county "<name>"|all      scrape towers for a county (or all registered)
 *       flags: --limit N  --dry-run  --headed
 *
 * ── Screenshots (per the spec) ─────────────────────────────────────────────────
 *   closeup : zoomed-in on the target parcel, owner name legible
 *   overlay : zoomed-out a few steps so surrounding owner names are visible
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { chromium } from 'playwright-extra';
import { chromium as pwChromium } from 'playwright';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type { BrowserContext, Page } from 'playwright';
import path from 'path';
import fs from 'fs';
import { uploadScreenshot, usingSupabase } from './ihunter-storage';
import { ocrOwnerNearPin, terminateOcr, cropPng } from './ihunter-ocr';
import { extractOwnerVLM, vlmModelName, checkVLM } from './ihunter-vlm';

chromium.use(StealthPlugin());

const prisma = new PrismaClient();

// ── Configuration ─────────────────────────────────────────────────────────────

const IHUNTER_URL = 'https://web.ihunterapp.com';
const PROFILE_DIR = path.join(__dirname, '.ihunter-profile');
const SHOTS_DIR = path.join(__dirname, 'ihunter_screenshots');
const PROVINCE = 'AB';

// CDP attach (recommended for Google SSO — bypasses "browser not secure")
const CDP_ENDPOINT = process.env.IHUNTER_CDP_ENDPOINT || 'http://localhost:9222';

// Selectors — verified against iHunter web DOM via the `probe` command.
// NOTE: owner names are painted into the raster landowner-map overlay, NOT the
// DOM, so they're extracted from the screenshot via OCR (see lookupTower).
const SEL = {
  searchBox:    '#titleheader-searchInput',
  dropdownItem: '.ihunter-menu-boundary-row',
  mapContainer: '.leaflet-container',
  zoomIn:       '.leaflet-control-zoom-in',
  zoomOut:      '.leaflet-control-zoom-out',
  opacityRange: 'input[type="range"]', // best-effort: the Map Opacity slider
};

// Zoom behaviour (env-tunable). Closeup uses the default coordinate-search zoom
// (0 extra steps) — zooming in further cuts off the stacked name labels.
const ZOOM_IN_STEPS  = parseInt(process.env.IHUNTER_ZOOM_IN ?? '0', 10);   // closeup
const ZOOM_OUT_STEPS = parseInt(process.env.IHUNTER_ZOOM_OUT ?? '2', 10);  // overlay (extra)

// Overlay opacity values (0..1) — best-effort if the slider is present
const OPACITY_CLOSEUP = 1.0;   // fully opaque → clearest text for OCR
const OPACITY_OVERLAY = 0.6;   // semi-transparent → see land under the names

// OCR pin-proximity radius in px (env-tunable). Lower if neighbour names bleed
// in, raise to catch long names. Scale up if you use IHUNTER_ZOOM_IN.
const OCR_RADIUS = parseInt(process.env.IHUNTER_OCR_RADIUS ?? '120', 10);

// Timing (ms)
const WAIT_DROPDOWN = 5000;
const WAIT_NAV      = 3200;   // after clicking suggestion, map flies to coord
const WAIT_RENDER   = 1200;   // let tiles/labels settle before a screenshot
const SLEEP_BETWEEN = 1200;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ── CLI parsing ───────────────────────────────────────────────────────────────

interface Args {
  command: string;
  county: string;
  limit: number;
  dryRun: boolean;
  headed: boolean;
  cdp: boolean;
  vlm: boolean;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const command = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'run';
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  return {
    command,
    county: get('--county') ?? 'all',
    limit: parseInt(get('--limit') ?? '1000', 10),
    dryRun: argv.includes('--dry-run'),
    headed: argv.includes('--headed'),
    cdp: argv.includes('--cdp') || process.env.IHUNTER_CDP === '1',
    vlm: argv.includes('--vlm') || process.env.IHUNTER_VLM === '1',
  };
}

// ── Browser ───────────────────────────────────────────────────────────────────

interface Session {
  context: BrowserContext;
  page: Page;
  cleanup: () => Promise<void>;
}

/**
 * Acquire a browser session.
 * - CDP mode: attach to a real Chrome you launched yourself (Google-friendly).
 * - else: Playwright-managed persistent profile (blocked by Google SSO).
 */
async function acquire(args: { cdp: boolean; headed?: boolean }): Promise<Session> {
  if (args.cdp) {
    let browser;
    try {
      browser = await pwChromium.connectOverCDP(CDP_ENDPOINT);
    } catch {
      throw new Error(
        `Could not attach to Chrome at ${CDP_ENDPOINT}.\n` +
        `Launch your real Chrome first (see: npx tsx scripts/ihunter-web-scraper.ts chrome-cmd), ` +
        `log into iHunter, then re-run with --cdp.`,
      );
    }
    const context = browser.contexts()[0] ?? (await browser.newContext());
    const page = context.pages().find(p => p.url().includes('ihunter')) ?? context.pages()[0] ?? (await context.newPage());
    // Don't close the user's Chrome — just drop the connection.
    return { context, page, cleanup: async () => { await browser.close().catch(() => {}); } };
  }

  fs.mkdirSync(PROFILE_DIR, { recursive: true });
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: !args.headed,
    viewport: { width: 1400, height: 900 },
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const page = context.pages().length ? context.pages()[0] : await context.newPage();
  return { context, page, cleanup: async () => { await context.close().catch(() => {}); } };
}

/** Print the OS-specific command to launch a debuggable real Chrome. */
function printChromeCmd() {
  const dir = path.join(__dirname, '.ihunter-chrome');
  console.log('\nLaunch your REAL Chrome with remote debugging, then log into iHunter in it.\n');
  console.log('Windows (PowerShell):');
  console.log(`  & "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --remote-debugging-port=9222 --user-data-dir="${dir}"\n`);
  console.log('macOS:');
  console.log(`  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --remote-debugging-port=9222 --user-data-dir="${dir.replace(/\\/g, '/')}"\n`);
  console.log('Then, in that Chrome window:');
  console.log(`  1. Go to ${IHUNTER_URL}`);
  console.log('  2. Sign in with Google (works — it is a normal Chrome)');
  console.log('  3. Make sure your purchased maps are visible');
  console.log('\nFinally run the scraper with --cdp:');
  console.log('  npx tsx scripts/ihunter-web-scraper.ts inspect --cdp');
  console.log('  npx tsx scripts/ihunter-web-scraper.ts run --county "Beaver County" --limit 3 --cdp\n');
}

// ── Registry (IHunterMapRun) ────────────────────────────────────────────────────

async function registerCounty(county: string) {
  const row = await prisma.iHunterMapRun.upsert({
    where: { county_province: { county, province: PROVINCE } },
    create: { county, province: PROVINCE, status: 'registered' },
    update: {},
  });
  const total = await countTowersForCounty(county);
  await prisma.iHunterMapRun.update({
    where: { id: row.id },
    data: { towersTotal: total },
  });
  console.log(`Registered "${county}" (${PROVINCE}) — ${total} towers in scope.`);
}

async function printStatus() {
  const rows = await prisma.iHunterMapRun.findMany({ orderBy: { county: 'asc' } });
  if (!rows.length) {
    console.log('No counties registered yet. Use:  register --county "Beaver County"');
    return;
  }
  console.table(rows.map(r => ({
    county: r.county,
    province: r.province,
    status: r.status,
    runs: r.timesRun,
    total: r.towersTotal,
    matched: r.towersMatched,
    missed: r.towersMissed,
    lastRun: r.lastRunAt ? r.lastRunAt.toISOString().slice(0, 16).replace('T', ' ') : '—',
  })));
}

// ── DB helpers ──────────────────────────────────────────────────────────────────

function countTowersForCounty(county: string) {
  return prisma.parcel.count({ where: { provinceRaw: PROVINCE, cityRaw: county } });
}

async function getTowers(county: string, limit: number) {
  let cities: string[];
  if (county === 'all') {
    const registered = await prisma.iHunterMapRun.findMany({ select: { county: true } });
    cities = registered.map(r => r.county);
    if (!cities.length) {
      console.log('No counties registered. Use:  register --county "<name>"');
      return [];
    }
  } else {
    cities = [county];
  }
  const parcels = await prisma.parcel.findMany({
    where: { provinceRaw: PROVINCE, cityRaw: { in: cities }, ownerId: null },
    take: limit,
    select: { cityRaw: true, tower: { select: { id: true, lat: true, lon: true } } },
  });
  return parcels
    .filter(p => p.tower)
    .map(p => ({ id: p.tower.id, lat: p.tower.lat, lon: p.tower.lon, city: p.cityRaw! }));
}

async function upsertOwner(name: string): Promise<number> {
  const existing = await prisma.owner.findFirst({ where: { name } });
  if (existing) return existing.id;
  const created = await prisma.owner.create({ data: { name, type: 'iHunter' } });
  return created.id;
}

async function saveResult(
  towerId: number,
  ownerName: string,
  closeupUrl: string | null,
  overlayUrl: string | null,
) {
  const ownerId = await upsertOwner(ownerName);
  await prisma.parcel.upsert({
    where: { towerId },
    create: {
      towerId, ownerId, dataSource: 'iHunter-OCR',
      ihunterCloseupUrl: closeupUrl, ihunterOverlayUrl: overlayUrl, ihunterScrapedAt: new Date(),
    },
    update: {
      ownerId, dataSource: 'iHunter-OCR',
      ihunterCloseupUrl: closeupUrl, ihunterOverlayUrl: overlayUrl, ihunterScrapedAt: new Date(),
    },
  });
  await prisma.tower.update({
    where: { id: towerId },
    data: { parcelProcessedAt: new Date() },
  });
}

/** Save screenshots only (when OCR found no name) so a human can read them. */
async function saveScreenshotsOnly(towerId: number, closeupUrl: string | null, overlayUrl: string | null) {
  await prisma.parcel.upsert({
    where: { towerId },
    create: { towerId, dataSource: 'iHunter-OCR', ihunterCloseupUrl: closeupUrl, ihunterOverlayUrl: overlayUrl, ihunterScrapedAt: new Date() },
    update: { ihunterCloseupUrl: closeupUrl, ihunterOverlayUrl: overlayUrl, ihunterScrapedAt: new Date() },
  });
}

// ── Scrape one tower ────────────────────────────────────────────────────────────

interface LookupResult {
  name: string | null;
  confidence: number;
  rawText: string;
  method: string;
  closeupUrl: string | null;
  overlayUrl: string | null;
}

/** Centre of the Leaflet map in viewport px (where the search pin lands). */
async function mapCenter(page: Page): Promise<{ x: number; y: number }> {
  const rect = await page.locator(SEL.mapContainer).first().boundingBox();
  if (!rect) return { x: 700, y: 450 };
  return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) };
}

/** Best-effort: set the Map Opacity slider (0..1). Silently no-ops if absent. */
async function setOpacity(page: Page, value: number) {
  try {
    const range = page.locator(SEL.opacityRange).first();
    if (!(await range.count())) return;
    await range.evaluate((el: HTMLInputElement, v: number) => {
      const min = parseFloat(el.min || '0');
      const max = parseFloat(el.max || '1');
      el.value = String(min + (max - min) * v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, value);
    await sleep(400);
  } catch { /* ignore */ }
}

async function clickZoom(page: Page, sel: string, steps: number) {
  const btn = page.locator(sel).first();
  for (let i = 0; i < steps; i++) {
    if (await btn.count()) await btn.click().catch(() => {});
    else { await page.mouse.move(700, 450); await page.mouse.wheel(0, sel === SEL.zoomOut ? 500 : -500); }
    await sleep(500);
  }
}

async function lookupTower(page: Page, towerId: number, lat: number, lon: number, useVlm: boolean): Promise<LookupResult> {
  const coord = `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
  const fail: LookupResult = { name: null, confidence: 0, rawText: '', method: '', closeupUrl: null, overlayUrl: null };

  // 1. Type the coordinate
  const search = page.locator(SEL.searchBox).first();
  await search.click();
  await search.fill('');
  await search.type(coord, { delay: 40 });

  // 2. Click the suggestion that MATCHES this coordinate (avoids clicking a stale
  //    row left over from the previous tower → identical results).
  const coordKey = lat.toFixed(5); // distinctive substring of this coord
  const item = page.locator(SEL.dropdownItem).filter({ hasText: coordKey }).first();
  try {
    await item.waitFor({ state: 'visible', timeout: WAIT_DROPDOWN });
  } catch {
    return fail;
  }
  await item.click();
  await sleep(WAIT_NAV); // map flies to the coordinate, pin drops at centre

  const center = await mapCenter(page);

  // 3a. CLOSE-UP: zoom in + full opacity → cleanest text for OCR
  await setOpacity(page, OPACITY_CLOSEUP);
  await clickZoom(page, SEL.zoomIn, ZOOM_IN_STEPS);
  await sleep(WAIT_RENDER);
  const closeupBuf = await page.screenshot();
  fs.writeFileSync(path.join(SHOTS_DIR, `tower_${towerId}_closeup.png`), closeupBuf);
  const closeupUrl = await uploadScreenshot(`tower_${towerId}_closeup.png`, closeupBuf).catch(() => null);

  // 3b. Extract the owner name — VLM first (if enabled), else/then OCR fallback
  let name: string | null = null;
  let confidence = 0;
  let rawText = '';
  let method = '';

  if (useVlm) {
    // Send a tight, pin-centred crop — the full image makes small VLMs pick the
    // wrong parcel; the crop focuses them on the pin's property.
    const vw = parseInt(process.env.IHUNTER_VLM_CROP_W ?? '560', 10);
    const vh = parseInt(process.env.IHUNTER_VLM_CROP_H ?? '380', 10);
    const vlmCrop = cropPng(closeupBuf, center.x, center.y, vw, vh);
    fs.writeFileSync(path.join(SHOTS_DIR, `tower_${towerId}_vlmcrop.png`), vlmCrop);
    const v = await extractOwnerVLM(vlmCrop);
    if (v.ok && v.name) { name = v.name; confidence = 90; method = 'VLM'; rawText = v.raw; }
  }

  if (!name) {
    // OCR the full closeup at the pin (map centre). We clip to the pin's section
    // column (red grid lines) + a proximity radius inside the helper — cropping
    // the image first severs those section bounds, so we pass the whole shot.
    const ocr = await ocrOwnerNearPin(closeupBuf, center.x, center.y, OCR_RADIUS);
    name = ocr.name; confidence = ocr.confidence; rawText = ocr.rawText; method = 'OCR';
  }

  // 3c. OVERLAY: zoom back out + semi-transparent → surrounding owner names
  await clickZoom(page, SEL.zoomOut, ZOOM_IN_STEPS + ZOOM_OUT_STEPS);
  await setOpacity(page, OPACITY_OVERLAY);
  await sleep(WAIT_RENDER);
  const overlayBuf = await page.screenshot();
  fs.writeFileSync(path.join(SHOTS_DIR, `tower_${towerId}_overlay.png`), overlayBuf);
  const overlayUrl = await uploadScreenshot(`tower_${towerId}_overlay.png`, overlayBuf).catch(() => null);

  // reset opacity for the next tower
  await setOpacity(page, OPACITY_CLOSEUP);

  return { name, confidence, rawText, method, closeupUrl, overlayUrl };
}

// ── Commands ──────────────────────────────────────────────────────────────────

async function cmdInspect(args: Args) {
  const { page, cleanup } = await acquire({ cdp: args.cdp, headed: true });
  if (!page.url().includes('ihunter')) {
    await page.goto(IHUNTER_URL, { waitUntil: 'domcontentloaded' });
    await sleep(5000);
  }

  console.log('\n=== INPUT elements ===');
  console.table(await page.$$eval('input', els =>
    els.map(e => ({
      type: (e as HTMLInputElement).type,
      placeholder: (e as HTMLInputElement).placeholder,
      ariaLabel: e.getAttribute('aria-label'),
      class: e.className?.slice(0, 40),
      id: e.id,
    })),
  ));

  console.log('\n=== BUTTONS (first 25) ===');
  console.table(await page.$$eval('button', els =>
    els.slice(0, 25).map(e => ({
      text: e.textContent?.trim().slice(0, 25),
      ariaLabel: e.getAttribute('aria-label')?.slice(0, 25),
      class: e.className?.slice(0, 40),
    })),
  ));

  console.log('\nInspect the DOM in the open window, then press ENTER to finish.');
  await new Promise<void>(resolve => {
    process.stdin.resume();
    process.stdin.once('data', () => resolve());
  });
  await cleanup();
}

/**
 * Drive a real search and dump (a) the suggestion dropdown elements that appear
 * after typing, and (b) the panel/popup that appears after selecting — so we can
 * pin down dropdownItem and ownerOverlay selectors.
 */
async function cmdProbe(args: Args) {
  const { page, cleanup } = await acquire({ cdp: args.cdp, headed: true });
  if (!page.url().includes('ihunter')) {
    await page.goto(IHUNTER_URL, { waitUntil: 'domcontentloaded' });
    await sleep(5000);
  }

  const coord = '53.061875, -111.786369'; // a Beaver County tower

  // snapshot visible elements before typing (returns a string[] — Sets don't serialize)
  const snapshot = (): Promise<string[]> => page.evaluate(() => {
    const out: string[] = [];
    document.querySelectorAll('*').forEach((el) => {
      const r = el.getBoundingClientRect();
      const text = (el.textContent || '').trim();
      if (r.width > 0 && r.height > 0 && text && text.length < 80) {
        out.push((el.tagName + '|' + (el.id || '') + '|' + ((el as HTMLElement).className?.toString() || '')).slice(0, 80) + '::' + text);
      }
    });
    return out;
  });

  void snapshot; // kept for reference; we now dump full DOM to files instead

  // dump every visible element with text to a JSON file for offline analysis
  const dumpVisible = () => page.evaluate(() => {
    const rows: any[] = [];
    document.querySelectorAll('body *').forEach((el) => {
      const r = el.getBoundingClientRect();
      const text = (el.textContent || '').trim();
      if (r.width > 0 && r.height > 0 && text && text.length <= 120) {
        // only leaf-ish nodes (avoid huge wrapper text)
        const directText = Array.from(el.childNodes)
          .filter(n => n.nodeType === 3)
          .map(n => (n.textContent || '').trim())
          .join(' ')
          .trim();
        rows.push({
          tag: el.tagName,
          id: el.id || '',
          class: ((el as HTMLElement).className?.toString() || ''),
          text: text.slice(0, 120),
          directText: directText.slice(0, 120),
          x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
        });
      }
    });
    return rows;
  });

  console.log(`\nTyping "${coord}" into ${SEL.searchBox} …`);
  const search = page.locator(SEL.searchBox).first();
  await search.click();
  await search.fill('');
  await search.type(coord, { delay: 80 });
  await sleep(3500);

  const afterType = await dumpVisible();
  const fileA = path.join(SHOTS_DIR, 'probe_after_type.json');
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  fs.writeFileSync(fileA, JSON.stringify(afterType, null, 2));
  const listy = afterType.filter((r: any) =>
    /result|suggest|dropdown|autocomplete|option|list|menu|item/i.test(r.class) || r.tag === 'LI'
    || r.text.includes('53.0') || r.text.includes('111.78'));
  console.log(`\n=== After typing: ${afterType.length} visible els, ${listy.length} dropdown-ish ===`);
  console.table(listy.slice(0, 30).map((r: any) => ({ tag: r.tag, class: r.class.slice(0, 40), text: r.text.slice(0, 40) })));
  console.log(`Full dump written to: ${fileA}`);

  console.log('\n>>> In the Chrome window, CLICK the suggestion for the coordinate. <<<');
  console.log('>>> Wait for the landowner overlay to appear, then press ENTER here. <<<');
  await new Promise<void>(resolve => {
    process.stdin.resume();
    process.stdin.once('data', () => resolve());
  });

  const afterClick = await dumpVisible();
  const fileB = path.join(SHOTS_DIR, 'probe_after_click.json');
  fs.writeFileSync(fileB, JSON.stringify(afterClick, null, 2));
  // also save a screenshot so we can see where the owner name renders
  await page.screenshot({ path: path.join(SHOTS_DIR, 'probe_after_click.png') }).catch(() => {});
  console.log(`\n=== After click: ${afterClick.length} visible els ===`);
  console.log(`Full dump written to: ${fileB}`);
  console.log(`Screenshot: ${path.join(SHOTS_DIR, 'probe_after_click.png')}`);

  console.log('\nDone probing. Press ENTER to finish.');
  await new Promise<void>(resolve => {
    process.stdin.resume();
    process.stdin.once('data', () => resolve());
  });
  await cleanup();
}

async function cmdRun(args: Args) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });

  const towers = await getTowers(args.county, args.limit);

  // Preflight the VLM so we don't hang on tower 1 if Ollama/model is missing
  let useVlm = args.vlm;
  if (useVlm) {
    console.log(`Checking Ollama / ${vlmModelName()} …`);
    const c = await checkVLM();
    if (!c.ok) {
      console.warn(`[VLM] ${c.msg}`);
      console.warn('[VLM] Disabling VLM for this run — using OCR instead.\n');
      useVlm = false;
    } else {
      console.log(`[VLM] ${c.msg}. First call loads the model (can take ~30-60s).`);
    }
  }

  console.log(`Towers to process: ${towers.length} (county: ${args.county})`);
  console.log(`Extractor: ${useVlm ? `VLM (${vlmModelName()}) with OCR fallback` : 'OCR (Tesseract)'}`);
  console.log(`Screenshot storage: ${usingSupabase() ? 'Supabase' : 'local public/ihunter'}`);

  if (args.dryRun) {
    towers.slice(0, 50).forEach((t, i) =>
      console.log(`  [${i + 1}] Tower ${t.id} [${t.city}] ${t.lat}, ${t.lon}`),
    );
    if (towers.length > 50) console.log(`  … and ${towers.length - 50} more`);
    console.log('\n(dry run — no browser, no DB writes)');
    return;
  }
  if (towers.length === 0) { console.log('Nothing to do.'); return; }

  const { page, cleanup } = await acquire({ cdp: args.cdp, headed: args.headed });
  if (!page.url().includes('ihunter')) {
    await page.goto(IHUNTER_URL, { waitUntil: 'domcontentloaded' });
    await sleep(5000);
  }

  if (!(await page.locator(SEL.searchBox).first().count())) {
    console.error('\nSearch box not found — you are probably not logged in to iHunter.');
    if (args.cdp) {
      console.error('Make sure your attached Chrome is signed in and showing the map.\n');
    } else {
      console.error('Google blocks automated login. Use CDP mode instead:');
      console.error('  npx tsx scripts/ihunter-web-scraper.ts chrome-cmd\n');
    }
    await cleanup();
    return;
  }

  // mark counties running
  const runCounties = [...new Set(towers.map(t => t.city))];
  for (const c of runCounties) {
    await prisma.iHunterMapRun.upsert({
      where: { county_province: { county: c, province: PROVINCE } },
      create: { county: c, province: PROVINCE, status: 'running', timesRun: 1, lastRunAt: new Date(), towersTotal: await countTowersForCounty(c) },
      update: { status: 'running', timesRun: { increment: 1 }, lastRunAt: new Date() },
    });
  }

  let saved = 0, missed = 0, errors = 0;
  const perCounty: Record<string, { matched: number; missed: number; processed: number }> = {};

  for (let i = 0; i < towers.length; i++) {
    const t = towers[i];
    perCounty[t.city] ??= { matched: 0, missed: 0, processed: 0 };
    process.stdout.write(`[${i + 1}/${towers.length}] Tower ${t.id} [${t.city}] … `);
    try {
      const { name, confidence, method, closeupUrl, overlayUrl } = await lookupTower(page, t.id, t.lat, t.lon, useVlm);
      perCounty[t.city].processed++;
      if (name) {
        await saveResult(t.id, name, closeupUrl, overlayUrl);
        saved++; perCounty[t.city].matched++;
        const flag = method === 'OCR' && confidence < 60 ? ' ⚠ low-confidence — please verify' : '';
        console.log(`'${name}' (${method} ${confidence}%)${flag}`);
      } else {
        // keep screenshots so a human can read the name manually
        await saveScreenshotsOnly(t.id, closeupUrl, overlayUrl);
        missed++; perCounty[t.city].missed++;
        console.log('[no name — screenshots saved for manual review]');
      }
    } catch (e: any) {
      errors++;
      console.log(`ERROR: ${e.message}`);
    }
    await sleep(SLEEP_BETWEEN);
  }

  // finalize registry rows
  for (const [county, s] of Object.entries(perCounty)) {
    await prisma.iHunterMapRun.update({
      where: { county_province: { county, province: PROVINCE } },
      data: {
        status: 'completed',
        towersProcessed: { increment: s.processed },
        towersMatched: { increment: s.matched },
        towersMissed: { increment: s.missed },
      },
    });
  }

  console.log(`\nDone. Saved ${saved}, missed ${missed}, errors ${errors}.`);
  console.log('Owner names are suggestions (dataSource "iHunter-OCR") — confirm them in the tower detail view against the screenshots.');
  await terminateOcr();
  await cleanup();
}

// ── Entry ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();
  switch (args.command) {
    case 'chrome-cmd': printChromeCmd(); break;
    case 'inspect':    await cmdInspect(args); break;
    case 'probe':      await cmdProbe(args); break;
    case 'register':   await registerCounty(args.county); break;
    case 'status':     await printStatus(); break;
    case 'run':        await cmdRun(args); break;
    default:
      console.log('Commands: chrome-cmd | inspect | probe | register --county "<name>" | status | run');
      console.log('  Google SSO: launch your own Chrome (chrome-cmd) and pass --cdp to inspect/run.');
      console.log('  run flags: --county "<name>"|all  --limit N  --dry-run  --headed  --cdp  --vlm');
      console.log('  --vlm uses a local Ollama vision model (see ihunter-vlm.ts) with OCR fallback.');
  }
}

main()
  .catch(e => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
