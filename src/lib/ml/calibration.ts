/**
 * Score calibration for the AI Score column.
 *
 * The model's raw output is a vote share, not a probability: 0.36 means 180 of
 * 500 trees voted tower. Displaying that number directly understates the real
 * signal, so the UI maps the raw score through this file and shows the measured
 * share of real towers instead.
 *
 * Measured by scripts/measure-band-precision.ts on rows that carry a human
 * label. These labels are the training set, so these are in-sample figures and
 * an upper bound on true accuracy.
 *
 * Regenerate:
 *   npx tsx --env-file=.env scripts/measure-band-precision.ts
 */
export interface CalibrationBand {
    /** Upper bound of the raw score band, exclusive. */
    max: number;
    /** Measured share of rows in this band that are real towers. */
    precision: number;
    /** Labeled rows this band was measured on. */
    checked: number;
}

export interface ScoreCalibration {
    version: string;
    labeledRows: number;
    /** Measured share of all labeled rows that are towers. */
    baseRate: number;
    bands: CalibrationBand[];
}

export const SCORE_CALIBRATION: ScoreCalibration = {
    version: 'rf-v2-2026-10-08',
    labeledRows: 4571,
    baseRate: 0.39,
    bands: [
        // Under 0.25: measured on 3,779 rows. The 0.20-0.25 band alone had 23
        // rows and a 26% rate, which dipped below the band beneath it and broke
        // monotonicity, so it is merged rather than shown as a worse band.
        { max: 0.25, precision: 0.34, checked: 3779 },
        { max: 0.338, precision: 0.52, checked: 510 },
        // Flag range and above: 282 checked rows, the most reliable band.
        { max: 1.01, precision: 0.83, checked: 282 },
    ],
};

/**
 * Maps a raw model score onto the measured tower rate for its band.
 *
 * Monotonic by contract: the band upper bounds ascend and each band's precision
 * is no lower than the previous band's, so a higher raw score can never produce
 * a lower displayed value. The check below makes that invariant loud at import
 * time instead of silently corrupting the sorted column.
 */
export function calibratedPercent(rawScore: number): number {
    for (const band of SCORE_CALIBRATION.bands) {
        if (rawScore < band.max) return Math.round(band.precision * 100);
    }
    const top = SCORE_CALIBRATION.bands[SCORE_CALIBRATION.bands.length - 1];
    return Math.round(top.precision * 100);
}

// Ascending precision guard: a non-monotonic table would let a scaled sort rank
// a worse row above a better one, which is exactly what the column is trusted for.
const _monotonic = SCORE_CALIBRATION.bands.every(
    (b, i) => i === 0 || b.precision >= SCORE_CALIBRATION.bands[i - 1].precision
);
if (!_monotonic) {
    throw new Error('score calibration bands must ascend in precision');
}
