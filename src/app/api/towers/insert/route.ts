import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-helpers';
import { importTowerRows } from '@/services/TowerImportService';
import { parseTowerCsv } from '@/lib/tower-csv-import';
import { TEMPLATE_COLUMNS, type ImportCountry } from '@/lib/tower-import-fields';

/** One manual row as CSV text, so it meets the same rules as an imported file. */
function toCsv(fields: Record<string, unknown>): string {
    const escape = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
    const cells = TEMPLATE_COLUMNS.map((header) => escape(String(fields[header] ?? '')));
    return `${TEMPLATE_COLUMNS.join(',')}\n${cells.join(',')}`;
}

// POST /api/towers/insert - Add one tower from the manual insert dialog.
// Body: { country: 'USA' | 'Canada', fields: { Address, City, ... } }
export async function POST(request: Request) {
    let user;
    try {
        user = await getAuthUser();
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json() as { country?: unknown; fields?: unknown };
        const country = body.country === 'USA' || body.country === 'Canada' ? body.country as ImportCountry : null;
        if (!country) {
            return NextResponse.json({ error: 'Pick the region: USA or Canada' }, { status: 400 });
        }
        const fields = body.fields && typeof body.fields === 'object' ? body.fields as Record<string, unknown> : {};

        const parsed = parseTowerCsv(toCsv(fields), country);
        if (parsed.rows.length === 0) {
            return NextResponse.json(
                { error: parsed.errors.map((entry) => entry.message).join('. ') || 'Check the fields' },
                { status: 400 },
            );
        }

        const outcome = await importTowerRows(parsed.rows, user.email, 'Manual Insert');
        const failure = outcome.errors[0];
        if (failure) {
            return NextResponse.json({ error: failure.message }, { status: 400 });
        }

        return NextResponse.json({ created: outcome.created, updated: outcome.updated });
    } catch (error) {
        console.error('Tower manual insert failed:', error);
        return NextResponse.json({ error: 'Insert failed' }, { status: 500 });
    }
}
