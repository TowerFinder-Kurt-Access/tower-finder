import { Command } from 'commander';
import { prisma } from '@/lib/prisma';
import { GridGenerator } from '@/lib/geo/GridGenerator';
import { enqueueJob } from '@/lib/job-queue';
import * as fs from 'fs';

const program = new Command();

program
  .name('conductor')
  .description('AT&T Rooftop Lease Discovery CLI')
  .version('1.0.0');

/**
 * COMMAND: start-discovery
 * Triggers a state-wide search by generating H3 cells and seeding the JobQueue.
 */
program
  .command('start-discovery')
  .description('Trigger discovery for a specific state boundary (GeoJSON)')
  .requiredOption('-s, --state <string>', 'State name (e.g. California)')
  .requiredOption('-f, --file <path>', 'Path to state boundary GeoJSON file')
  .action(async (options) => {
    console.log(`[CLI] Seeding discovery for ${options.state}...`);
    
    try {
        const geojson = JSON.parse(fs.readFileSync(options.file, 'utf-8'));
        const cells = GridGenerator.generateCells(geojson, 7); // Resolution 7

        console.log(`[CLI] Generated ${cells.length} hexagonal H3 cells.`);

        for (const h3Index of cells) {
            const [lat, lon] = GridGenerator.getCentroid(h3Index);
            
            await enqueueJob('scrape_all_sources', {
                state: options.state,
                h3Index,
                lat,
                lon
            });
        }

        console.log(`[CLI] Successfully queued ${cells.length} jobs into the JobQueue.`);
    } catch (err: any) {
        console.error('[CLI] Discovery Seed Failed:', err.message);
    } finally {
        await prisma.$disconnect();
    }
  });

/**
 * COMMAND: export
 * Exports the discovered rooftop leases to JSON or CSV.
 */
program
  .command('export')
  .description('Export discovered AT&T rooftop leases')
  .option('-o, --output <path>', 'Output file path', 'discovered_leases.json')
  .option('--format <string>', 'Export format (json|csv)', 'json')
  .action(async (options) => {
    console.log('[CLI] Exporting verified rooftop sites...');
    
    try {
        const leases = await prisma.tower.findMany({
            where: {
                source: 'Fused Discovery',
                cellMapperLog: { isNot: null }
            },
            include: { cellMapperLog: true }
        });

        const outputData = leases.map(t => ({
            site_id: t.cellMapperLog?.towerId || t.id,
            owner_name: t.businessName,
            match_score: t.cellMapperLog?.matchScore,
            structure_type: t.cellMapperLog?.structureType,
            coordinates: `${t.lat}, ${t.lon}`,
            h3_index: t.cellMapperLog?.h3Index,
            last_verified: t.cellMapperLog?.lastVerifiedAt
        }));

        if (options.format === 'csv') {
            const csvRows = [
                'site_id,owner_name,match_score,structure_type,coordinates,h3_index,last_verified',
                ...outputData.map(d => `${d.site_id},"${d.owner_name}",${d.match_score},"${d.structure_type}",${d.coordinates},${d.h3_index},${d.last_verified}`)
            ];
            fs.writeFileSync(options.output, csvRows.join('\n'));
        } else {
            fs.writeFileSync(options.output, JSON.stringify(outputData, null, 2));
        }

        console.log(`[CLI] Export complete: ${leases.length} sites saved to ${options.output}`);
    } catch (err: any) {
        console.error('[CLI] Export Failed:', err.message);
    } finally {
        await prisma.$disconnect();
    }
  });

program.parse(process.argv);
