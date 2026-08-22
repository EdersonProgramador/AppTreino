import { clamp } from "../geo";
import type { RawFix } from "../types";

type State = {
  lat: number;
  lng: number;
  vLat: number;
  vLng: number;
  speed: number;
  initialized: boolean;
  lastT: number;
};

/** Kalman CV 2D (lat/lng) + speed 1D. R cresce com accuracy GPS. */
export class GeoKalmanFilter {
  private state: State = {
    lat: 0,
    lng: 0,
    vLat: 0,
    vLng: 0,
    speed: 0,
    initialized: false,
    lastT: 0
  };

  reset(fix?: RawFix) {
    if (!fix) {
      this.state.initialized = false;
      return;
    }
    this.state = {
      lat: fix.lat,
      lng: fix.lng,
      vLat: 0,
      vLng: 0,
      speed: Math.max(0, fix.speedMps ?? 0),
      initialized: true,
      lastT: fix.t
    };
  }

  update(fix: RawFix): { lat: number; lng: number; speedMps: number } {
    if (!this.state.initialized) {
      this.reset(fix);
      return { lat: fix.lat, lng: fix.lng, speedMps: Math.max(0, fix.speedMps ?? 0) };
    }

    const dt = clamp((fix.t - this.state.lastT) / 1000, 0.05, 5);
    let lat = this.state.lat + this.state.vLat * dt;
    let lng = this.state.lng + this.state.vLng * dt;
    let vLat = this.state.vLat;
    let vLng = this.state.vLng;
    let speed = this.state.speed;

    const accuracy = fix.accuracyM ?? 10;
    const kPos = clamp(1 / (1 + accuracy / 8), 0.08, 0.85);
    const kVel = clamp(kPos * 0.65, 0.05, 0.55);

    const measVLat = (fix.lat - this.state.lat) / dt;
    const measVLng = (fix.lng - this.state.lng) / dt;

    lat += kPos * (fix.lat - lat);
    lng += kPos * (fix.lng - lng);
    vLat += kVel * (measVLat - vLat);
    vLng += kVel * (measVLng - vLng);

    const mLat = 111_320;
    const mLng = 111_320 * Math.cos((lat * Math.PI) / 180);
    const speedFromVel = Math.sqrt((vLat * mLat) ** 2 + (vLng * mLng) ** 2);
    const measSpeed = fix.speedMps != null && fix.speedMps >= 0 ? fix.speedMps : speedFromVel;
    const kSpeed = clamp(kPos * 0.7, 0.05, 0.6);
    speed = Math.max(0, speed + kSpeed * (measSpeed - speed));

    this.state = { lat, lng, vLat, vLng, speed, initialized: true, lastT: fix.t };
    return { lat, lng, speedMps: speed };
  }
}
