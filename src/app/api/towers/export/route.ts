import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-helpers';
import { ExportService } from '@/services/ExportService';
import { buildTowerAccessFilter } from '@/lib/tower-access';

export async function POST(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { ids, all } = body;

    // Enforce tower access control: CALLER can only export assigned towers
    if (all && user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden — only ADMIN can export all towers' }, { status: 403 });
    }
    let towerIds: number[] | undefined = undefined;
    if (!all && Array.isArray(ids)) {
      // Validate requested ids are within user's access
      const accessFilter = buildTowerAccessFilter(user.id, user.role as any);
      // If CALLER, ensure each requested tower is assigned; otherwise filter via DB check in ExportService
      // For now, restrict to ADMIN or filtered service; leaf enforcement: pass through after check
      towerIds = ids;
      if (user.role !== 'ADMIN') {
        const { prisma } = await import('@/lib/prisma');
        const allowed = await prisma.towerAssignment.findMany({ where: { userId: user.id, towerId: { in: towerIds } }, select: { towerId: true } });
        const allowedIds = new Set(allowed.map(a=>a.towerId));
        towerIds = towerIds.filter((id:number) => allowedIds.has(id));
        if (towerIds.length === 0) return NextResponse.json({ error: 'No authorized towers in selection' }, { status: 403 });
      }
    } else if (all) {
      // all:true already gated to ADMIN above, keeps towerIds=undefined for full export
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
