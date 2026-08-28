/**
 * Wall-clock fixed-timestep accountant. Each frame pays elapsed time into a
 * debt that is settled in whole substeps. Debt persists across frames — a
 * late frame is repaid over the following ones (bounded per frame), never
 * discarded, so simulation speed stays wall-true under arbitrary callback
 * jitter. Debt itself is capped so a long suspension (tab sleep, heavy
 * throttling) resumes instead of fast-forwarding for seconds.
 */
export class FrameClock {
    private _last: number | null = null;
    private _debtMs = 0;

    constructor(
        private readonly _substepMs: number,
        private readonly _maxCatchupSubsteps: number,
        private readonly _maxDebtMs: number
    ) {}

    /** Substeps owed for this frame, given a monotonic timestamp in ms. */
    tick(nowMs: number): number {
        if (this._last === null) {
            this._last = nowMs;
            return 0;
        }
        const elapsed = Math.max(0, nowMs - this._last);
        this._last = nowMs;
        this._debtMs = Math.min(this._debtMs + elapsed, this._maxDebtMs);
        const steps = Math.min(
            Math.floor(this._debtMs / this._substepMs),
            this._maxCatchupSubsteps
        );
        this._debtMs -= steps * this._substepMs;
        return steps;
    }

    /**
     * Return unexecuted substeps to the debt (a frame ran out of its wall
     * budget) so simulated time still tracks the clock instead of warping.
     */
    refund(substeps: number): void {
        this._debtMs = Math.min(
            this._debtMs + substeps * this._substepMs,
            this._maxDebtMs
        );
    }
}
