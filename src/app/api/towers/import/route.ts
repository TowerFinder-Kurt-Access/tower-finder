import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-helpers';
import { importTowerRows } from '@/services/TowerImportService';
import { MAX_IMPORT_ROWS, parseTowerCsv } from '@/lib/tower-csv-import';
import type { ImportCountry } from '@/lib/tower-import-fields';

// POST /api/towers/import - Bulk-import towers from a CSV file.
// Body: { csv: string, country: 'USA' | 'Canada', commit?: boolean }
// Without commit the route validates and returns the preview only.
export async function POST(request: Request) {
    let user;
    try {
        user = await requireAdmin();
    } catch (error) {
        const forbidden = error instanceof Error && error.message.includes('Forbidden');
        return NextResponse.json(
            { error: forbidden ? 'Forbidden - Admin access required' : 'Unauthorized' },
            { status: forbidden ? 403 : 401 },
        );
    }

    try {
        const body = await request.json() as { csv?: unknown; country?: unknown; commit?: unknown };
        if (typeof body.csv !== 'string' || body.csv.trim() === '') {
            return NextResponse.json({ error: 'The request needs a csv string' }, { status: 400 });
        }
        const country = body.country === 'USA' || body.country === 'Canada' ? body.country as ImportCountry : null;
        if (!country) {
            return NextResponse.json({ error: 'Pick the import region: USA or Canada' }, { status: 400 });
        }

        const parsed = parseTowerCsv(body.csv, country);
        if (parsed.totalRows > MAX_IMPORT_ROWS) {
            return NextResponse.json({ error: parsed.errors[0]?.message ?? 'Too many rows' }, { status: 400 });
        }

        if (body.commit !== true) {
            return NextResponse.json({
                country,
                totalRows: parsed.totalRows,
                validCount: parsed.rows.length,
                errorCount: parsed.errors.length,
                errors: parsed.errors,
                regions: parsed.regions,
            });
        }

        const outcome = parsed.rows.length > 0
            ? await importTowerRows(parsed.rows, user.email)
            : { created: 0, updated: 0, skipped: 0, errors: [] };

        return NextResponse.json({
            country,
            totalRows: parsed.totalRows,
            validCount: parsed.rows.length,
            errorCount: parsed.errors.length + outcome.errors.length,
            errors: [...parsed.errors, ...outcome.errors],
            regions: parsed.regions,
            created: outcome.created,
            updated: outcome.updated,
        });
    } catch (error) {
        console.error('Tower CSV import failed:', error);
        return NextResponse.json({ error: 'Import failed' }, { status: 500 });
    }
}
