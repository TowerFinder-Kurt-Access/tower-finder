/**
 * Backfill: upload existing local iHunter screenshots (public/ihunter/*.png) to
 * Supabase Storage and rewrite the Parcel URLs from "/ihunter/..." to the public
 * Supabase URL, so they load on the deployed app.
 *
 * Run: npx tsx scripts/ihunter-backfill-screenshots.ts
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { uploadScreenshot, usingSupabase } from './ihunter-storage';

const prisma = new PrismaClient();
const PUBLIC_DIR = path.join(__dirname, '..', 'public', 'ihunter');

async function migrateUrl(localUrl: string | null): Promise<string | null> {
  if (!localUrl || !localUrl.startsWith('/ihunter/')) return localUrl; // already cloud or empty
  const file = localUrl.replace('/ihunter/', '');
  const full = path.join(PUBLIC_DIR, file);
  if (!fs.existsSync(full)) {
    console.warn(`  missing local file: ${file}`);
    return localUrl;
  }
  const buf = fs.readFileSync(full);
  return uploadScreenshot(file, buf);
}

async function main() {
  if (!usingSupabase()) {
    console.error('Supabase not configured (SUPABASE_URL / SUPABASE_KEY). Aborting.');
    process.exit(1);
  }

  const parcels = await prisma.parcel.findMany({
    where: {
      dataSource: 'iHunter-OCR',
      OR: [
        { ihunterCloseupUrl: { startsWith: '/ihunter/' } },
        { ihunterOverlayUrl: { startsWith: '/ihunter/' } },
      ],
    },
    select: { id: true, towerId: true, ihunterCloseupUrl: true, ihunterOverlayUrl: true },
  });

  console.log(`Migrating screenshots for ${parcels.length} parcels…`);
  let done = 0;
  for (const p of parcels) {
    process.stdout.write(`  tower ${p.towerId} … `);
    try {
      const closeup = await migrateUrl(p.ihunterCloseupUrl);
      const overlay = await migrateUrl(p.ihunterOverlayUrl);
      await prisma.parcel.update({
        where: { id: p.id },
        data: { ihunterCloseupUrl: closeup, ihunterOverlayUrl: overlay },
      });
      done++;
      console.log('ok');
    } catch (e: any) {
      console.log(`ERROR: ${e.message}`);
    }
  }
  console.log(`\nDone. Migrated ${done}/${parcels.length}.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
