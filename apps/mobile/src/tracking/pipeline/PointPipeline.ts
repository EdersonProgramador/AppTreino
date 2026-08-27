import { haversineMeters } from "../geo";
import type { FilteredFix, RawFix, Sport } from "../types";
import { AutoPauseController } from "../filter/AutoPause";
import { GeoKalmanFilter } from "../filter/GeoKalmanFilter";
import { noiseRejectReason } from "../filter/NoiseGates";
import { PaceEma } from "../filter/PaceEma";
import { latLngToCell } from "../h3/cells";
import { FIELD_CALIBRATION } from "../fieldCalibration";

export type PipelineResult = {
  fix: FilteredFix;
  distanceDeltaM: number;
  isAutoPaused: boolean;
};

/** NoiseGates → Kalman → Pace EMA → AutoPause → Δdistância Haversine. */
export class PointPipeline {
  private kalman = new GeoKalmanFilter();
  private pace = new PaceEma();
  private autoPause = new AutoPauseController();
  private prevRaw: RawFix | null = null;
  private prevFiltered: { lat: number; lng: number; t: number } | null = null;
  private seq = 0;

  reset() {
    this.kalman.reset();
    this.pace.reset();
    this.autoPause.reset();
    this.prevRaw = null;
    this.prevFiltered = null;
    this.seq = 0;
  }

  warmStart(lat: number, lng: number, t: number, seq: number) {
    this.kalman.reset({
      t,
      lat,
      lng,
      ele: null,
      accuracyM: 8,
      speedMps: 0,
      heading: null
    });
    this.prevFiltered = { lat, lng, t };
    this.seq = seq;
  }

  process(sport: Sport, raw: RawFix, stepsDetected?: boolean | null): PipelineResult {
    this.seq += 1;
    const reject = noiseRejectReason(sport, raw, this.prevRaw);

    if (reject) {
      return {
        fix: {
          ...raw,
          filteredLat: raw.lat,
          filteredLng: raw.lng,
          filteredSpeedMps: Math.max(0, raw.speedMps ?? 0),
          paceSecKm: this.pace.value(),
          isAccepted: false,
          rejectReason: reject,
          seq: this.seq,
          h3r9: null,
          h3r11: null
        },
        distanceDeltaM: 0,
        isAutoPaused: this.autoPause.isPaused()
      };
    }

    this.prevRaw = raw;

    const filtered = this.kalman.update(raw);
    const dtSec = this.prevFiltered ? Math.max(0.05, (raw.t - this.prevFiltered.t) / 1000) : 1;
    const paceSecKm = this.pace.update(filtered.speedMps, dtSec);
    const isAutoPaused = this.autoPause.evaluate(filtered.speedMps, raw.t, stepsDetected);

    let distanceDeltaM = 0;
    if (this.prevFiltered && !isAutoPaused) {
      distanceDeltaM = haversineMeters(this.prevFiltered, { lat: filtered.lat, lng: filtered.lng });
      if (distanceDeltaM < FIELD_CALIBRATION.minDistanceStepM) distanceDeltaM = 0;
    }

    this.prevFiltered = { lat: filtered.lat, lng: filtered.lng, t: raw.t };

    return {
      fix: {
        ...raw,
        filteredLat: filtered.lat,
        filteredLng: filtered.lng,
        filteredSpeedMps: filtered.speedMps,
        paceSecKm,
        isAccepted: true,
        rejectReason: null,
        seq: this.seq,
        h3r9: latLngToCell(filtered.lat, filtered.lng, 9),
        h3r11: latLngToCell(filtered.lat, filtered.lng, 11)
      },
      distanceDeltaM,
      isAutoPaused
    };
  }
}
