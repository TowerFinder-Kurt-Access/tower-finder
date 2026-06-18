/**
 * OCR helper for iHunter landowner-map screenshots (Tesseract via tesseract.js v7).
 *
 * Owner names are painted into the raster landowner-map overlay as stacked,
 * multi-line labels (e.g. "MAXWELL," / "GLEN A" / "AND" / "EMMA H"). Picking the
 * right one is two-stage:
 *
 *   1. The bold RED lines are the section grid. We find the red verticals either
 *      side of the pin to clip OUT neighbouring sections (the main source of
 *      wrong names).
 *   2. Within that column the section stacks several quarter-section owners with
 *      no bold divider, so we take the label nearest the pin's Y and grow it to
 *      the adjacent lines that form the same stacked name.
 *
 * The result is a *suggestion* a human confirms in the tower detail view.
 */

import { createWorker, PSM } from 'tesseract.js';
import { PNG } from 'pngjs';

let workerPromise: ReturnType<typeof createWorker> | null = null;

async function getWorker() {
  if (!workerPromise) workerPromise = createWorker('eng');
  const worker = await workerPromise;
  await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
  return worker;
}

export async function terminateOcr() {
  if (workerPromise) {
    const w = await workerPromise;
    await w.terminate();
    workerPromise = null;
  }
}

export interface OcrResult {
  name: string | null;
  rawText: string;
  confidence: number;
}

interface OcrLine { text: string; conf: number; x0: number; y0: number; x1: number; y1: number; }

function clean(s: string): string {
  return s
    .replace(/[|_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[^A-Za-z0-9 ,.&'\-]/g, '')
    .trim();
}

function looksLikeName(s: string): boolean {
  const letters = (s.match(/[A-Za-z]/g) || []).length;
  return letters >= 2 && s.length >= 2;
}

/** Crop a PNG buffer to a w×h box centred on (cx,cy), clamped to image bounds. */
export function cropPng(buf: Buffer, cx: number, cy: number, w: number, h: number): Buffer {
  const src = PNG.sync.read(buf);
  const cw = Math.min(w, src.width);
  const ch = Math.min(h, src.height);
  const x0 = Math.max(0, Math.min(src.width - cw, Math.round(cx - cw / 2)));
  const y0 = Math.max(0, Math.min(src.height - ch, Math.round(cy - ch / 2)));
  const out = new PNG({ width: cw, height: ch });
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const si = ((y0 + y) * src.width + (x0 + x)) * 4;
      const di = (y * cw + x) * 4;
      out.data[di] = src.data[si];
      out.data[di + 1] = src.data[si + 1];
      out.data[di + 2] = src.data[si + 2];
      out.data[di + 3] = 255;
    }
  }
  return PNG.sync.write(out);
}

function collectLines(data: any): OcrLine[] {
  const out: OcrLine[] = [];
  for (const block of data.blocks || []) {
    for (const para of block.paragraphs || []) {
      for (const line of para.lines || []) {
        const text = clean(line.text || '');
        if (!text) continue;
        const b = line.bbox || {};
        out.push({ text, conf: line.confidence ?? 0, x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 });
      }
    }
  }
  return out;
}

/** Find the section's left/right red boundary lines around the pin. */
function redVerticalBounds(buf: Buffer, pinX: number, pinY: number): { xMin: number; xMax: number } {
  let xMin = 0, xMax = Number.MAX_SAFE_INTEGER;
  try {
    const png = PNG.sync.read(buf);
    const { width: W, height: H, data } = png;
    const isRed = (x: number, y: number) => {
      const i = (y * W + x) * 4;
      return data[i] > 140 && data[i + 1] < 95 && data[i + 2] < 95;
    };
    const band = 70;
    const y0 = Math.max(0, pinY - band), y1 = Math.min(H - 1, pinY + band);
    const vRed = (x: number) => { let c = 0; for (let y = y0; y <= y1; y++) if (isRed(x, y)) c++; return c; };
    const TH = Math.max(12, Math.round((y1 - y0) * 0.35));
    xMax = W;
    for (let x = Math.min(W - 1, pinX + 10); x < W; x++) if (vRed(x) > TH) { xMax = x; break; }
    xMin = 0;
    for (let x = Math.max(0, pinX - 10); x >= 0; x--) if (vRed(x) > TH) { xMin = x; break; }
  } catch { /* fall back to no bounds */ }
  return { xMin, xMax };
}

/**
 * @param cropPng PNG buffer of the crop
 * @param pinX    pin x within the crop (px)
 * @param pinY    pin y within the crop (px)
 * @param radius  fallback proximity if section bounds can't be found
 */
export async function ocrOwnerNearPin(
  cropPng: Buffer,
  pinX: number,
  pinY: number,
  radius = 120,
): Promise<OcrResult> {
  const worker = await getWorker();
  const { data }: any = await worker.recognize(cropPng, {}, { blocks: true, text: true });

  let lines = collectLines(data).filter(l => looksLikeName(l.text));
  const rawText = clean((data.text || '').replace(/\n/g, ' | '));
  if (!lines.length) return { name: null, rawText, confidence: 0 };

  // Stage 1 — clip to the pin's section column using red grid verticals
  // (removes neighbouring sections left/right of the pin)
  const { xMin, xMax } = redVerticalBounds(cropPng, pinX, pinY);
  const inColumn = lines.filter(l => {
    const cx = (l.x0 + l.x1) / 2;
    return cx >= xMin && cx <= xMax;
  });
  if (inColumn.length) lines = inColumn;

  // Stage 2 — keep lines within `radius` of the pin (excludes other quarter
  // sections stacked above/below in the same column), then join in reading order.
  const withDist = lines.map(l => ({
    ...l,
    dist: Math.hypot((l.x0 + l.x1) / 2 - pinX, (l.y0 + l.y1) / 2 - pinY),
  }));
  let near = withDist.filter(l => l.dist <= radius);
  if (!near.length) near = withDist.sort((a, b) => a.dist - b.dist).slice(0, 4);

  near.sort((a, b) => (a.y0 - b.y0) || (a.x0 - b.x0));
  const name = clean(near.map(l => l.text).join(' '));
  const confidence = Math.round(near.reduce((s, l) => s + l.conf, 0) / near.length);

  return { name: name || null, rawText, confidence };
}
