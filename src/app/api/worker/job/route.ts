import { NextResponse } from 'next/server';
import { pickNextJob, markCompleted, markFailed } from '@/lib/job-queue';

function isAuthorized(request: Request): boolean {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  return authHeader === `Bearer ${cronSecret}`;
}

// GET /api/worker/job?type=fcc_rooftop_discovery
// Polls next pending job (claims it) — worker executes handler locally
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const typeFilter = searchParams.get('type') || undefined;
  try {
    const job = await pickNextJob(typeFilter);
    if (!job) return NextResponse.json({ job: null });
    return NextResponse.json({ job });
  } catch (e) {
    console.error('[worker/job] GET failed:', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// POST /api/worker/job  { jobId, action: 'complete'|'fail', result?, error?, runAfter? }
export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const body = await request.json();
    const { jobId, action, result, error, runAfter } = body as {
      jobId: number;
      action: 'complete' | 'fail';
      result?: Record<string, unknown>;
      error?: string;
      runAfter?: string;
    };
    if (!jobId || !action) {
      return NextResponse.json({ error: 'jobId and action required' }, { status: 400 });
    }
    if (action === 'complete') {
      await markCompleted(jobId, result);
      return NextResponse.json({ ok: true });
    }
    if (action === 'fail') {
      await markFailed(jobId, error || 'Unknown error', runAfter ? new Date(runAfter) : undefined);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (e) {
    console.error('[worker/job] POST failed:', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
