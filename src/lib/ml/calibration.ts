/**
 * Score calibration for the AI Score column.
 *
 * The model's raw output is a vote share, not a probability: 0.36 means 180 of
 * 500 trees voted tower. Displaying it directly understates the signal, so the
 * UI maps the raw score through these anchors and shows the measured share of
 * real towers instead.
 *
 * Anchors come from isotonic regression over measured raw-score bins, which
 * enforces non-decreasing rates: the raw bin rates are noisy and dip in the
 * middle (26% and 24% at 0.20-0.30 against 49% and 59% at 0.05-0.15), and a
 * sorted column must never rank a higher score below a lower one.
 *
 * Measured by scripts/measure-calibration.ts on rows that carry a human label.
 * Those labels are the training set, so these are in-sample figures and an
 * upper bound on field accuracy.
 *
 * Regenerate:
 *   npx tsx --env-file=.env scripts/measure-calibration.ts
 */
export interface ScoreAnchor {
    /** Raw model score at this anchor point. */
    raw: number;
    /** Measured tower rate for scores at or above `raw`. */
    precision: number;
    /** Labeled rows behind this anchor. */
    checked: number;
}

export const SCORE_VERSION = 'rf-v2-2026-10-08';

export const SCORE_ANCHORS: ScoreAnchor[] = [
    { raw: 0.0, precision: 0.34, checked: 3633 },
    { raw: 0.05, precision: 0.36, checked: 282 },
    { raw: 0.3, precision: 0.62, checked: 374 },
    { raw: 0.35, precision: 0.83, checked: 282 },
    { raw: 1.0, precision: 0.83, checked: 0 },
];

/**
 * Maps a raw model score onto the measured tower rate, interpolating linearly
 * between anchors so the displayed number rises and falls with the score
 * instead of stepping between fixed bands.
 *
 * Anchors must be non-decreasing in `precision`. A dip would rank a higher raw
 * score below a lower one, so the guard throws at import time rather than
 * silently corrupting the sorted column.
 */
export function calibratedPercent(rawScore: number): number {
    const first = SCORE_ANCHORS[0];
    if (rawScore <= first.raw) return Math.round(first.precision * 100);

    const last = SCORE_ANCHORS[SCORE_ANCHORS.length - 1];
    if (rawScore >= last.raw) return Math.round(last.precision * 100);

    for (let i = 1; i < SCORE_ANCHORS.length; i++) {
        const hi = SCORE_ANCHORS[i];
        if (rawScore > hi.raw) continue;
        const lo = SCORE_ANCHORS[i - 1];
        const span = hi.raw - lo.raw;
        // A zero-width anchor pair cannot interpolate; fall back to the upper value.
        if (span <= 0) return Math.round(hi.precision * 100);
        const t = (rawScore - lo.raw) / span;
        const value = lo.precision + t * (hi.precision - lo.precision);
        return Math.round(value * 100);
    }
    return Math.round(last.precision * 100);
}

const monotone = SCORE_ANCHORS.every(
    (a, i) => i === 0 || a.precision >= SCORE_ANCHORS[i - 1].precision
);
if (!monotone) {
    throw new Error('score calibration anchors must be non-decreasing in precision');
}
