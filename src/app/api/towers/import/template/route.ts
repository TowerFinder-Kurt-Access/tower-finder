import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-helpers';
import { TEMPLATE_COLUMNS, type ImportCountry } from '@/lib/tower-import-fields';
import ExcelJS from 'exceljs';

// GET /api/towers/import/template?country=USA|Canada
// Serves the Excel template: the import columns in Tower List order, and a
// guide sheet. It holds no example rows, so a user cannot mistake sample data
// for content to keep. The import itself accepts CSV only.
export async function GET(request: Request) {
    try {
        await requireAdmin();
    } catch (error) {
        const forbidden = error instanceof Error && error.message.includes('Forbidden');
        return NextResponse.json(
            { error: forbidden ? 'Forbidden - Admin access required' : 'Unauthorized' },
            { status: forbidden ? 403 : 401 },
        );
    }

    const { searchParams } = new URL(request.url);
    const country: ImportCountry = searchParams.get('country') === 'Canada' ? 'Canada' : 'USA';
    const baseName = `towers-${country.toLowerCase()}-template`;

    const workbook = new ExcelJS.Workbook();
    workbook.created = new Date();
    const sheet = workbook.addWorksheet('Towers', {
        views: [{ state: 'frozen', ySplit: 1 }],
    });

    sheet.columns = TEMPLATE_COLUMNS.map((header) => ({
        header,
        key: header,
        width: header === 'Address' ? 42 : header === 'Notes' ? 34 : 20,
    }));

    // The header row stays bare column names: a sheet saved as CSV becomes the
    // import file, so "Address (required)" would be an unknown header.
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF3F8' } };

    // Requiring a column is marked with a header comment, which a CSV export drops.
    const requiredHeaders = new Set(['Address', 'City', 'County', 'State', 'ZIP']);
    for (const [index, header] of TEMPLATE_COLUMNS.entries()) {
        const cell = sheet.getRow(1).getCell(index + 1);
        cell.note = requiredHeaders.has(header)
            ? `${header} is required. Latitude and Longitude are not columns; each address is geocoded.`
            : `${header} is optional. Leave the cell blank when you have no value.`;
    }

    const guide = workbook.addWorksheet('How to import');
    guide.columns = [{ width: 96 }];
    const guideLines = [
        'Tower import template',
        '',
        `Region: ${country}`,
        `Column order: ${TEMPLATE_COLUMNS.join(', ')}.`,
        'Required columns: Address, City, County, State, ZIP.',
        'Optional columns: Type, Lease Expiry, Owner Name, Contact Person, Notes.',
        'Latitude and Longitude are not columns. Each address is geocoded on import.',
        'Business counts come from the nightly job, so a file cannot set them.',
        '',
        'How to import:',
        '1. Fill the Towers sheet. Keep the header row unchanged.',
        `2. Save the sheet as CSV: File > Download > Comma-separated values (.csv) in Google Sheets,`,
        '   or File > Save As > CSV in Excel.',
        '3. In the Towers List, use Import CSV and choose that .csv file.',
        '',
        'The importer accepts CSV only. This workbook is a template, not an import format.',
    ];
    guideLines.forEach((line, index) => {
        const row = guide.getRow(index + 1);
        row.getCell(1).value = line;
        if (index === 0) row.font = { bold: true, size: 13 };
    });

    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(new Uint8Array(buffer as ArrayBuffer), {
        headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="${baseName}.xlsx"`,
        },
    });
}
