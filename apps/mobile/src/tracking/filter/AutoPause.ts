import { FIELD_CALIBRATION } from "../fieldCalibration";

/**
 * Auto-pause: velocidade filtrada < limiar por ≥ holdMs.
 * Pedômetro (stepsDetected) força "em movimento".
 */
export class AutoPauseController {
  private belowSince: number | null = null;
  private paused = false;

  constructor(
    private readonly speedThresholdMps = FIELD_CALIBRATION.autoPauseKmh / 3.6,
    private readonly holdMs = FIELD_CALIBRATION.autoPauseHoldMs
  ) {}

  reset() {
    this.belowSince = null;
    this.paused = false;
  }

  evaluate(filteredSpeedMps: number, now: number, stepsDetected?: boolean | null): boolean {
    const moving = filteredSpeedMps >= this.speedThresholdMps || stepsDetected === true;
    if (moving) {
      this.belowSince = null;
      this.paused = false;
      return false;
    }
    if (this.belowSince == null) this.belowSince = now;
    if (now - this.belowSince >= this.holdMs) {
      this.paused = true;
      return true;
    }
    return this.paused;
  }

  isPaused() {
    return this.paused;
  }
}
