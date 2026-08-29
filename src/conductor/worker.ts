import { JOB_HANDLERS } from '@/lib/job-handlers';

/**
 * Standalone Discovery Worker (HTTP mode — F17)
 *
 * Polls JobQueue via /api/worker/job with CRON_SECRET Bearer — no direct DB creds on laptop.
 * Handler execution stays local (Playwright). This must run on a machine with Playwright/Chromium.
 *
 * Env: CRON_SECRET (required), APP_URL or NEXTAUTH_URL (prod URL, e.g. https://tower-finder.vercel.app)
 * Usage: npx tsx src/conductor/worker.ts [--type fcc_rooftop_discovery]
 */

const APP_URL = (
  process.env.APP_URL ||
  process.env.NEXTAUTH_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
).replace(/\/$/, '');

const CRON_SECRET = process.env.CRON_SECRET;

if (!CRON_SECRET) {
  console.error('[Worker] CRON_SECRET not set — add it to .env (same value as Vercel env)');
  process.exit(1);
}

/** Retry on transient network errors */
async function withRetry<T>(fn: () => Promise<T>, retries = 3, delayMs = 5000): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const isTransient = msg.includes('fetch failed') || msg.includes('ECONN') || msg.includes('ETIMEDOUT');
      if (isTransient && i < retries - 1) {
        console.warn(`[Worker] Transient error, retrying in ${delayMs / 1000}s... (attempt ${i + 1}/${retries})`);
        await new Promise((res) => setTimeout(res, delayMs));
        continue;
      }
      throw err;
    }
  }
  throw new Error('withRetry exhausted');
}

async function pollJob(typeFilter?: string): Promise<{ id: number; jobType: string; params: Record<string, unknown> } | null> {
  const url = new URL('/api/worker/job', APP_URL);
  if (typeFilter) url.searchParams.set('type', typeFilter);
  const res = await fetch(url.toString(), {
    headers: { authorization: `Bearer ${CRON_SECRET}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`poll failed ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { job: { id: number; jobType: string; params: Record<string, unknown> } | null };
  return data.job;
}

async function completeJob(jobId: number, result?: Record<string, unknown>): Promise<void> {
  const res = await fetch(new URL('/api/worker/job', APP_URL).toString(), {
    method: 'POST',
    headers: { authorization: `Bearer ${CRON_SECRET}`, 'content-type': 'application/json' },
    body: JSON.stringify({ jobId, action: 'complete', result }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`complete failed ${res.status}: ${await res.text()}`);
}

async function failJob(jobId: number, error: string): Promise<void> {
  const res = await fetch(new URL('/api/worker/job', APP_URL).toString(), {
    method: 'POST',
    headers: { authorization: `Bearer ${CRON_SECRET}`, 'content-type': 'application/json' },
    body: JSON.stringify({ jobId, action: 'fail', error }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`fail failed ${res.status}: ${await res.text()}`);
}

async function main(): Promise<void> {
  const typeFilter =
    process.argv.find((a) => a.startsWith('--type='))?.split('=')[1] ||
    (process.argv.includes('--type') ? process.argv[process.argv.indexOf('--type') + 1] : null);

  console.log('[Worker] Starting AT&T Discovery Worker (HTTP mode)...');
  console.log(`[Worker] APP_URL=${APP_URL}`);
  if (typeFilter) console.log(`[Worker] Filtering for job type: ${typeFilter}`);
  else console.log('[Worker] Looking for any and all jobs...');

  let running = true;
  const shutdown = async (): Promise<void> => {
    console.log('[Worker] Shutting down gracefully...');
    running = false;
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  let processedTotal = 0;
  let consecutiveErrors = 0;

  while (running) {
    let job: { id: number; jobType: string; params: Record<string, unknown> } | null = null;
    try {
      job = await withRetry(() => pollJob(typeFilter || undefined));
      consecutiveErrors = 0;
    } catch (err: unknown) {
      consecutiveErrors++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[Worker] Failed to poll job (${consecutiveErrors} consecutive errors):`, msg);
      const backoff = Math.min(10000 * Math.pow(2, consecutiveErrors - 1), 300000);
      console.log(`[Worker] Backing off for ${backoff / 1000}s...`);
      await new Promise((res) => setTimeout(res, backoff));
      continue;
    }

    if (!job) {
      process.stdout.write('.');
      await new Promise((res) => setTimeout(res, 1000));
      continue;
    }

    console.log(`\n[Worker] Picking up Job ${job.id} (${job.jobType})`);

    const handler = JOB_HANDLERS[job.jobType];
    if (!handler) {
      console.warn(`[Worker] Unknown job type: ${job.jobType}, skipping.`);
      try {
        await withRetry(() => failJob(job!.id, `Unknown job type: ${job!.jobType}`));
      } catch {}
      continue;
    }

    try {
      const result = await handler(job.params as Record<string, unknown>, String(job.id));
      await withRetry(() => completeJob(job!.id, result as Record<string, unknown>));
      processedTotal++;
      console.log(`[Worker] Job ${job.id} completed. Total processed: ${processedTotal}`);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[Worker] Job ${job.id} failed:`, msg);
      try {
        await withRetry(() => failJob(job!.id, msg));
      } catch (dbErr: unknown) {
        const m2 = dbErr instanceof Error ? dbErr.message : String(dbErr);
        console.error(`[Worker] Could not mark job ${job.id} as failed:`, m2);
      }
    }

    await new Promise((res) => setTimeout(res, 2000));
  }
}

main().catch((err) => {
  console.error('[Worker] Fatal error:', err);
  process.exit(1);
});
