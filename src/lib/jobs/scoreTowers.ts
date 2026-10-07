import { prisma } from '@/lib/prisma';
import { enqueueJob } from '@/lib/job-queue';
import {
    loadTowerModel, scoreTowers, staleTowerWhere, loadScoreInputs, allBusinessAggregates,
    TOWER_SELECT, isScorable,
} from '@/lib/ml/score';

const BATCH_SIZE = 5000;

export async function scoreTowerBatch(params: { batchSize?: number }): Promise<unknown> {
    const batchSize = params.batchSize || BATCH_SIZE;
    const model = loadTowerModel();
    console.log(`[Score Towers] model ${model.version} (AUC ${model.metrics.auc.toFixed(3)}), threshold ${model.threshold}`);

    const where = staleTowerWhere(model.version);
    const towers = await prisma.tower.findMany({
        where,
        select: TOWER_SELECT,
        orderBy: { id: 'asc' },
        take: batchSize,
    });

    if (towers.length === 0) {
        console.log('[Score Towers] every row already carries the current model version');
        return { scored: 0, cleared: 0, remaining: 0, version: model.version };
    }

    const { scored, cleared } = await scoreTowers(prisma, towers, model, await loadScoreInputs(prisma, towers.map(t => t.id)));
    const remaining = await prisma.tower.count({ where });
    console.log(`[Score Towers] scored ${scored}, cleared ${cleared}, remaining ${remaining}`);

    if (remaining > 0) {
        await enqueueJob('score_towers', { batchSize });
    }
    return {
        scored,
        cleared,
        remaining,
        skippedInBatch: towers.filter(t => !isScorable(t)).length,
        version: model.version,
    };
}

export async function scoreAllTowers(): Promise<unknown> {
    const model = loadTowerModel();
    const where = staleTowerWhere(model.version);
    const towers = await prisma.tower.findMany({ where, select: TOWER_SELECT, orderBy: { id: 'asc' } });
    const business = await allBusinessAggregates(prisma);
    const { scored, cleared } = await scoreTowers(prisma, towers, model, {
        population: towers.map(t => ({ id: t.id, lat: t.lat, lon: t.lon })),
        business,
    });
    const remaining = await prisma.tower.count({ where });
    return { scored, cleared, remaining, version: model.version };
}