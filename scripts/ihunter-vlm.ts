/**
 * Local vision-model extraction via Ollama (free, runs on your machine).
 *
 * Sends the close-up screenshot (blue pin near centre) to a local multimodal
 * model and asks for the owner name of the parcel the pin sits in. This handles
 * dense maps and off-centre labels far better than OCR geometry.
 *
 * Setup (one time):
 *   1. Install Ollama:  https://ollama.com/download   (Windows installer)
 *   2. Pull a vision model:
 *        ollama pull qwen2.5vl:7b        (recommended — strong at reading text)
 *        ollama pull llama3.2-vision     (alternative)
 *        ollama pull moondream           (smallest/fastest, less accurate)
 *   3. Run the scraper with --vlm  (or IHUNTER_VLM=1)
 *
 * Env:
 *   OLLAMA_HOST         default http://localhost:11434
 *   IHUNTER_VLM_MODEL   default qwen2.5vl:7b
 */

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
// gemma3:4b is multimodal, small enough for CPU, and accurate on a pin-centred
// crop. qwen2.5vl:7b is more accurate but too slow without a GPU.
const MODEL = process.env.IHUNTER_VLM_MODEL || 'gemma3:4b';
const TIMEOUT_MS = parseInt(process.env.IHUNTER_VLM_TIMEOUT ?? '180000', 10);

const PROMPT = [
  'This image is a rural land-ownership map. Property rectangles each have an owner',
  'name printed inside them. A blue teardrop map pin marks one location near the',
  'centre of the image; the pin points at exactly one property.',
  '',
  'Reply with ONLY the owner name printed inside the property rectangle that the',
  "tip of the blue pin sits in. Copy it exactly as written — it may be stacked over",
  'multiple lines, so join those lines with spaces. Do not include any other',
  'property names, numbers, or explanation. If you truly cannot read it, reply',
  'exactly: UNKNOWN',
].join(' ');

function clean(s: string): string {
  return s
    .replace(/^["']|["']$/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[^A-Za-z0-9 ,.&'\-]/g, '')
    .trim();
}

export interface VlmResult {
  name: string | null;
  raw: string;
  ok: boolean;       // false if Ollama/model was unreachable
  error?: string;
}

let warned = false;

export async function extractOwnerVLM(imagePng: Buffer): Promise<VlmResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({
        model: MODEL,
        prompt: PROMPT,
        images: [imagePng.toString('base64')],
        stream: false,
        options: { temperature: 0 },
      }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      return { name: null, raw: '', ok: false, error: `Ollama ${res.status}: ${txt.slice(0, 120)}` };
    }
    const json: any = await res.json();
    const raw = (json.response || '').trim();
    const name = /^\s*unknown\s*$/i.test(raw) ? null : (clean(raw) || null);
    return { name, raw, ok: true };
  } catch (e: any) {
    const timedOut = e.name === 'AbortError';
    if (!warned) {
      if (timedOut) {
        console.warn(`\n[VLM] ${MODEL} took >${Math.round(TIMEOUT_MS / 1000)}s — likely slow on CPU. Falling back to OCR.`);
        console.warn('[VLM] Try a lighter model:  IHUNTER_VLM_MODEL=moondream  (or raise IHUNTER_VLM_TIMEOUT).\n');
      } else {
        console.warn(`\n[VLM] Could not reach Ollama at ${OLLAMA_HOST} (model ${MODEL}).`);
        console.warn('[VLM] Install: https://ollama.com/download  then:  ollama pull ' + MODEL);
        console.warn('[VLM] Falling back to OCR for this run.\n');
      }
      warned = true;
    }
    return { name: null, raw: '', ok: false, error: e.message };
  } finally {
    clearTimeout(timer);
  }
}

/** Preflight: is Ollama up and the model pulled? Also warms the model. */
export async function checkVLM(): Promise<{ ok: boolean; msg: string }> {
  let models: string[] = [];
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/tags`);
    if (!res.ok) return { ok: false, msg: `Ollama responded ${res.status} at ${OLLAMA_HOST}` };
    const j: any = await res.json();
    models = (j.models || []).map((m: any) => m.name);
  } catch (e: any) {
    return { ok: false, msg: `Cannot reach Ollama at ${OLLAMA_HOST} (${e.message}). Start it or install from https://ollama.com/download` };
  }
  const base = MODEL.split(':')[0];
  const has = models.some(n => n === MODEL || n.split(':')[0] === base);
  if (!has) {
    return { ok: false, msg: `Model "${MODEL}" not pulled. Run:  ollama pull ${MODEL}\n       Installed: ${models.join(', ') || 'none'}` };
  }
  return { ok: true, msg: `Ollama reachable, model "${MODEL}" present` };
}

export function vlmModelName() { return MODEL; }
