import { prisma } from '../lib/prisma.ts';
import * as xlsx from 'xlsx';

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
    });

    if (towers.length === 0) {
      // Return an empty workbook if no towers
      const wb = xlsx.utils.book_new();
      const ws = xlsx.utils.aoa_to_sheet([['No data']]);
      xlsx.utils.book_append_sheet(wb, ws, 'Towers');
      return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
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
      const row: any = {};
      const rawData = (t.rawImportData as any) || {};

      // Fill in raw data columns
      headers.forEach(header => {
        if (header !== 'System Notes') {
          row[header] = rawData[header] ?? (t as any)[header] ?? '';
        }
      });

      // Fill in System Notes column
      row['System Notes'] = t.notes.map(n => {
        const date = n.createdAt.toISOString().split('T')[0];
        const initials = n.initials ? ` [${n.initials}]` : '';
        return `${date}${initials}: ${n.content}`;
      }).join('; ');

      return row;
    });

    // 3. Generate Workbook
    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.json_to_sheet(dataRows, { header: headers });
    xlsx.utils.book_append_sheet(wb, ws, 'Towers Export');

    return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
  }
}
