import { clamp } from "../geo";
import { FIELD_CALIBRATION } from "../fieldCalibration";

/** Pace suavizado (s/km) via EMA. */
export class PaceEma {
  private paceSecKm: number | null = null;

  constructor(private readonly tauSec = FIELD_CALIBRATION.paceEmaTauSec) {}

  reset() {
    this.paceSecKm = null;
  }

  update(speedMps: number, dtSec: number): number | null {
    if (speedMps < 0.3) return this.paceSecKm;
    const instant = 1000 / speedMps;
    if (!Number.isFinite(instant) || instant <= 0 || instant > 3600) return this.paceSecKm;

    if (this.paceSecKm == null) {
      this.paceSecKm = instant;
      return this.paceSecKm;
    }

    const alpha = clamp(dtSec / (this.tauSec + dtSec), 0.05, 0.5);
    this.paceSecKm += alpha * (instant - this.paceSecKm);
    return this.paceSecKm;
  }

  value() {
    return this.paceSecKm;
  }
}
