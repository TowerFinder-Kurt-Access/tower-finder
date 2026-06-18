# iHunter Landowner Scraper

Automates looking up each tower's coordinates on **web.ihunterapp.com**, reads the
landowner name off the purchased landowner-map overlay, captures two screenshots,
and saves everything to the database for a human to confirm.

Only works in provinces/counties where you have **purchased the iHunter landowner
map**. Currently set up for Alberta: **Beaver County** and **Athabasca County**.

---

## Why it's built the way it is

- **Google SSO blocks automated browsers** ("this browser may not be secure"). So
  we don't let Playwright launch the browser — you launch your *own* Chrome with
  remote debugging, log in normally, and the script **attaches over CDP**.
- **Owner names are painted into the raster map overlay, not the DOM** — they
  can't be read as page text. We extract them from the screenshot image.
- **Extraction = a local vision model (gemma3:4b via Ollama)** on a pin-centred
  crop. It reads the stacked label of the parcel the pin sits in. Tesseract OCR
  is the automatic fallback. (qwen2.5vl is more accurate but too slow without a
  GPU; moondream can't read the dense labels.)
- Names are **suggestions** (`dataSource = "iHunter-OCR"`) — a person confirms
  them in the tower detail view against the two saved screenshots.

---

## One-time setup

1. **Install Ollama** (free, local): https://ollama.com/download
2. **Pull the vision model:**
   ```bash
   ollama pull gemma3:4b
   ```
3. **Dependencies** are already in the repo (`playwright`, `tesseract.js`,
   `pngjs`, `@supabase/supabase-js`). If needed: `npm install`.
4. **(Optional) Supabase Storage** for screenshots on the deployed app — set in
   `.env`:
   ```
   SUPABASE_URL=...
   SUPABASE_SERVICE_ROLE_KEY=...
   SUPABASE_STORAGE_BUCKET=ihunter-screenshots
   ```
   Without these, screenshots save to `public/ihunter/` (visible when running the
   app locally).

---

## Running it

### 1. Launch your real Chrome with debugging (once per session)

```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="C:\Users\alexa\Development\tower-finder\scripts\.ihunter-chrome"
```
(Reprint anytime: `npx tsx scripts/ihunter-web-scraper.ts chrome-cmd`)

In that Chrome window: go to https://web.ihunterapp.com, sign in with Google, and
make sure your purchased maps are visible. The login persists in that profile, so
later you just relaunch Chrome with the same command.

### 2. Register the counties you own (once)

```bash
npx tsx scripts/ihunter-web-scraper.ts register --county "Beaver County"
npx tsx scripts/ihunter-web-scraper.ts register --county "Athabasca County"
```

### 3. Run

```bash
# small test first
npx tsx scripts/ihunter-web-scraper.ts run --county "Beaver County" --limit 3 --cdp --vlm

# full batch for both owned counties
npx tsx scripts/ihunter-web-scraper.ts run --county all --cdp --vlm
```

`--county all` processes every registered county that still has towers without an
owner. Expect ~1 min/tower on a CPU-only machine (gemma3:4b).

### 4. Check progress / confirm

```bash
npx tsx scripts/ihunter-web-scraper.ts status
```

Then open each tower in the app's detail view — the **iHunter Landowner Map**
section shows the close-up + overlay screenshots so a caller can confirm or correct
the suggested owner name.

---

## Commands

| Command | What it does |
|---|---|
| `chrome-cmd` | Print the command to launch a debuggable Chrome |
| `register --county "<name>"` | Add a county to the run registry |
| `status` | Show per-county run counts (runs, matched, missed) |
| `run` | Scrape towers (see flags) |
| `inspect --cdp` | Dump page inputs/buttons (DOM debugging) |
| `probe --cdp` | Dump the search dropdown + post-click DOM/screenshot (selector tuning) |

### `run` flags

| Flag | Default | Meaning |
|---|---|---|
| `--county "<name>"` / `--county all` | `all` | which county(ies) |
| `--limit N` | 1000 | max towers this run |
| `--cdp` | off | attach to your launched Chrome (required for Google SSO) |
| `--vlm` | off | use the local vision model (recommended); OCR fallback |
| `--dry-run` | off | list towers without browser/DB writes |
| `--headed` | off | (non-CDP path only) show the browser |

### Env tuning

| Var | Default | Effect |
|---|---|---|
| `IHUNTER_VLM_MODEL` | `gemma3:4b` | Ollama vision model |
| `IHUNTER_VLM_CROP_W` / `_H` | `560` / `380` | crop sent to the model (tighter = more focused) |
| `IHUNTER_VLM_TIMEOUT` | `180000` | per-image timeout (ms) before OCR fallback |
| `IHUNTER_OCR_RADIUS` | `120` | OCR: how far from the pin to gather name lines |
| `IHUNTER_ZOOM_IN` | `0` | extra zoom-in steps for the close-up |
| `IHUNTER_ZOOM_OUT` | `2` | zoom-out steps for the overlay shot |

---

## What gets written

- **Owner** — upserted by name, `type = "iHunter"`.
- **Parcel** — `ownerId`, `dataSource = "iHunter-OCR"`, `ihunterCloseupUrl`,
  `ihunterOverlayUrl`, `ihunterScrapedAt`.
- **Tower** — `parcelProcessedAt`. `hasOwnerName` is derived from `parcel.ownerId`
  and is sortable/filterable on the towers dashboard.
- **IHunterMapRun** — per-county registry: `timesRun`, `towersTotal`,
  `towersMatched`, `towersMissed`, `lastRunAt`.

Screenshots per tower: `tower_<id>_closeup.png` (full-opacity, OCR/VLM source),
`tower_<id>_overlay.png` (zoomed-out, semi-transparent, surrounding owners),
`tower_<id>_vlmcrop.png` (exact crop the model saw).

---

## Files

| File | Role |
|---|---|
| `scripts/ihunter-web-scraper.ts` | main scraper + CLI |
| `scripts/ihunter-vlm.ts` | local vision model (Ollama) extraction |
| `scripts/ihunter-ocr.ts` | Tesseract fallback + crop/section helpers |
| `scripts/ihunter-storage.ts` | screenshot storage (Supabase or local) |
| `prisma/schema.prisma` | `IHunterMapRun` model + `Parcel` iHunter fields |

---

## Troubleshooting

- **"browser not secure" on Google login** — you launched via the script instead
  of your own Chrome. Use the `chrome-cmd` flow and `--cdp`.
- **Search box not found** — the attached Chrome isn't logged in / not showing the
  map.
- **Every tower returns the same name** — fixed (clicks the suggestion matching the
  coordinate); if it recurs, raise `WAIT_NAV` in the script.
- **VLM hangs / very slow** — that machine has no GPU. Stick to `gemma3:4b`; a
  bigger model (qwen2.5vl) is too slow. Each call falls back to OCR after the
  timeout.
- **Wrong parcel picked** — tighten the crop: `IHUNTER_VLM_CROP_W=480
  IHUNTER_VLM_CROP_H=320`.
