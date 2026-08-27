import { prisma } from '../lib/prisma';
import ExcelJS from 'exceljs';
import { Prisma } from '@prisma/client';

export type TowerWithNotes = Prisma.TowerGetPayload<{
  include: { notes: true }
}>;

export class ExportService {
  /**
   * Exports a list of towers to an Excel buffer.
   * @param towerIds Optional list of tower IDs to export. If omitted, all towers are exported.
   */
  static async exportTowersToExcel(towerIds?: number[]): Promise<Buffer> {
    const towers = await prisma.tower.findMany({
      where: towerIds ? { id: { in: towerIds } } : {},
      include: {
        notes: {
          orderBy: { createdAt: 'asc' }
        }
      }
    }) as TowerWithNotes[];
    if (towers.length === 0) {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Towers');
      ws.addRow(['No data']);
      const buf = await wb.xlsx.writeBuffer();
      return Buffer.from(buf as ArrayBuffer);
    }

    // 1. Determine all headers from rawImportData across all towers
    const allHeadersSet = new Set<string>();
    towers.forEach(t => {
      if (t.rawImportData && typeof t.rawImportData === 'object') {
        Object.keys(t.rawImportData).forEach(key => allHeadersSet.add(key));
      }
    });

    // If no rawImportData found, use some default headers from the Tower model
    if (allHeadersSet.size === 0) {
      allHeadersSet.add('id');
      allHeadersSet.add('lat');
      allHeadersSet.add('lon');
      allHeadersSet.add('businessName');
      allHeadersSet.add('remarks');
    }

    const headers = Array.from(allHeadersSet);
    headers.push('System Notes');

    // 2. Prepare data rows
    const dataRows = towers.map(t => {
      const row: Record<string, string> = {};
      const rawData = (t.rawImportData as Record<string, string> | null) ?? {};

      // Fill in raw data columns
      headers.forEach(header => {
        if (header !== 'System Notes') {
          const fromRaw = (rawData as Record<string, string>)[header];
          const fromTower = (t as unknown as Record<string, string>)[header];
          row[header] = fromRaw ?? fromTower ?? '';
        }
      });

      // Fill in System Notes column
      row['System Notes'] = t.notes
        .filter(n => n.authorId !== null)
        .map(n => {
          const date = n.createdAt.toISOString().split('T')[0];
          const initials = n.initials ? ` [${n.initials}]` : '';
          return `${date}${initials}: ${n.content}`;
        }).join('; ');

      return row;
    });

    // 3. Generate Workbook with exceljs (xlsx removed — GHSA-4r6h/5pgg no fix)
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Towers Export');
    ws.columns = headers.map(h => ({ header: h, key: h, width: 20 }));
    ws.addRows(dataRows);
    // Header bold
    ws.getRow(1).font = { bold: true };
    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf as ArrayBuffer);
  }
}
