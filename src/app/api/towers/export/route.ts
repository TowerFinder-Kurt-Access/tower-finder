import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-helpers';
import { ExportService } from '@/services/ExportService';

export async function POST(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { ids, all } = body;

    let towerIds: number[] | undefined = undefined;
    if (!all && Array.isArray(ids)) {
      towerIds = ids;
    }

    const buffer = await ExportService.exportTowersToExcel(towerIds);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `towers_export_${timestamp}.xlsx`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error: any) {
    console.error('Export error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
