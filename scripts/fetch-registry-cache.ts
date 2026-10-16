/**
 * Downloads open registry snapshots into data/registry-cache/raw/.
 *
 * Sources (all free, no API key):
 *  - FCC ASR: weekly complete registration dump, pipe-delimited .dat files.
 *    r_tower.zip — constructed registrations only (~38 MB).
 *  - ISED TAFL: monthly all-services extract.
 *    TAFL_LTAF.zip — the host geo-routes this URL, so a failed fetch is
 *    recorded in the manifest and the run continues; drop the file in
 *    manually and rerun to pick it up.
 *
 * Nothing is written to the database. Run:
 *   npx tsx scripts/fetch-registry-cache.ts
 */
import * as fs from 'fs';
import * as path from 'path';

const CACHE = path.join(process.cwd(), 'data', 'registry-cache');
const RAW = path.join(CACHE, 'raw');

const SOURCES: { name: string; file: string; url: string; license: string }[] = [
    {
        name: 'fcc-asr',
        file: 'fcc-asr.zip',
        url: 'https://data.fcc.gov/download/pub/uls/complete/r_tower.zip',
        license: 'US public domain (FCC ULS/ASR public access files)',
    },
    {
        name: 'ised-tafl',
        file: 'ised-tafl.zip',
        url: 'https://www.ic.gc.ca/engineering/SMS_TAFL_Files/TAFL_LTAF.zip',
        license: 'Open Government Licence - Canada',
    },
];

interface ManifestEntry {
    name: string;
    url: string;
    license: string;
    file: string | null;
    bytes: number | null;
    fetchedAt: string | null;
    error: string | null;
}

async function fetchOne(url: string, dest: string): Promise<{ bytes: number }> {
    const res = await fetch(url, {
        headers: { 'User-Agent': 'tower-finder registry-cache (research use)' },
    });
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} for ${url}`);
    const out = fs.createWriteStream(dest);
    let bytes = 0;
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
        bytes += chunk.length;
        if (!out.write(chunk)) await new Promise<void>((r) => out.once('drain', r));
    }
    await new Promise<void>((resolve, reject) => {
        out.end((e?: Error) => (e ? reject(e) : resolve()));
    });
    return { bytes };
}

async function main() {
    fs.mkdirSync(RAW, { recursive: true });
    const entries: ManifestEntry[] = [];
    for (const src of SOURCES) {
        const dest = path.join(RAW, src.file);
        if (fs.existsSync(dest)) {
            const st = fs.statSync(dest);
            console.log(`${src.name}: already cached (${st.size} bytes), skipping`);
            entries.push({
                name: src.name, url: src.url, license: src.license,
                file: src.file, bytes: st.size, fetchedAt: null, error: null,
            });
            continue;
        }
        try {
            console.log(`${src.name}: downloading ${src.url}`);
            const { bytes } = await fetchOne(src.url, dest);
            console.log(`${src.name}: ${bytes} bytes`);
            entries.push({
                name: src.name, url: src.url, license: src.license,
                file: src.file, bytes, fetchedAt: new Date().toISOString(), error: null,
            });
        } catch (e) {
            console.log(`${src.name}: FAILED (${(e as Error).message}) — drop the file in manually and rerun`);
            entries.push({
                name: src.name, url: src.url, license: src.license,
                file: null, bytes: null, fetchedAt: null, error: (e as Error).message,
            });
        }
    }
    fs.writeFileSync(
        path.join(CACHE, 'manifest.json'),
        `${JSON.stringify({ generatedAt: new Date().toISOString(), sources: entries }, null, 2)}\n`,
    );
    console.log(`manifest: ${path.join(CACHE, 'manifest.json')}`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
