/**
 * Storage helper for iHunter screenshots.
 *
 * - If SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set, uploads to a public
 *   Supabase Storage bucket and returns the public URL (works on deployed app).
 * - Otherwise falls back to saving into the Next.js public/ihunter/ directory and
 *   returns a relative "/ihunter/<file>" URL (works when running the app locally).
 *
 * Env:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   SUPABASE_STORAGE_BUCKET   (default: "ihunter-screenshots")
 */

import fs from 'fs';
import path from 'path';

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'ihunter-screenshots';
const PUBLIC_DIR = path.join(__dirname, '..', 'public', 'ihunter');

let supabase: any = null;
let supabaseReady = false;

function getSupabase() {
  if (supabaseReady) return supabase;
  supabaseReady = true;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    supabase = null;
    return null;
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createClient } = require('@supabase/supabase-js');
  supabase = createClient(url, key, { auth: { persistSession: false } });
  return supabase;
}

let bucketEnsured = false;
async function ensureBucket(client: any) {
  if (bucketEnsured) return;
  bucketEnsured = true;
  try {
    const { data } = await client.storage.getBucket(BUCKET);
    if (!data) {
      await client.storage.createBucket(BUCKET, { public: true });
    }
  } catch {
    // createBucket throws if it exists already in some versions — ignore
    await client.storage.createBucket(BUCKET, { public: true }).catch(() => {});
  }
}

export function usingSupabase(): boolean {
  return getSupabase() !== null;
}

/**
 * Upload a PNG buffer and return a public/relative URL.
 * @param key  storage object key, e.g. "tower_123_closeup.png"
 * @param buffer  PNG bytes
 */
export async function uploadScreenshot(key: string, buffer: Buffer): Promise<string> {
  const client = getSupabase();

  if (client) {
    await ensureBucket(client);
    const { error } = await client.storage
      .from(BUCKET)
      .upload(key, buffer, { contentType: 'image/png', upsert: true });
    if (error) throw new Error(`Supabase upload failed: ${error.message}`);
    const { data } = client.storage.from(BUCKET).getPublicUrl(key);
    return data.publicUrl as string;
  }

  // Local fallback → public/ihunter/<key>
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  fs.writeFileSync(path.join(PUBLIC_DIR, key), buffer);
  return `/ihunter/${key}`;
}
