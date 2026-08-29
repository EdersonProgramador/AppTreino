import { estimateMotionCount } from "./activity-geo";

type OutdoorSport = "RUN" | "WALK" | "RIDE";

type DeviceMotionCtor = typeof DeviceMotionEvent & {
  requestPermission?: () => Promise<PermissionState | "granted" | "denied">;
};

export class WebStepCounter {
  private sensorCount = 0;
  private lastPeakAt = 0;
  private lastMag = 0;
  private listening = false;
  private sport: OutdoorSport = "RUN";

  private onMotion = (event: DeviceMotionEvent) => {
    const acc = event.accelerationIncludingGravity ?? event.acceleration;
    if (!acc) return;
    const mag = Math.sqrt((acc.x ?? 0) ** 2 + (acc.y ?? 0) ** 2 + (acc.z ?? 0) ** 2);
    const now = event.timeStamp || Date.now();
    const rising = mag > this.lastMag + 1.8;
    const strong = mag > (this.sport === "RIDE" ? 11.6 : 12.4);
    if (rising && strong && now - this.lastPeakAt > (this.sport === "RIDE" ? 220 : 280)) {
      this.sensorCount += 1;
      this.lastPeakAt = now;
    }
    this.lastMag = mag;
  };

  reset() {
    this.sensorCount = 0;
    this.lastPeakAt = 0;
    this.lastMag = 0;
  }

  hydrate(count: number) {
    if (!Number.isFinite(count) || count <= 0) return;
    this.sensorCount = Math.max(this.sensorCount, Math.round(count));
  }

  async start(sport: OutdoorSport) {
    this.sport = sport;
    if (this.listening || typeof window === "undefined") return;
    const Motion = window.DeviceMotionEvent as DeviceMotionCtor | undefined;
    try {
      if (typeof Motion?.requestPermission === "function") {
        const perm = await Motion.requestPermission();
        if (perm !== "granted") return;
      }
    } catch {
      return;
    }
    window.addEventListener("devicemotion", this.onMotion, { passive: true });
    this.listening = true;
  }

  stop() {
    if (!this.listening || typeof window === "undefined") return;
    window.removeEventListener("devicemotion", this.onMotion);
    this.listening = false;
  }

  getCount(distanceMeters: number, sport: OutdoorSport = this.sport) {
    const fromDistance = estimateMotionCount(sport, distanceMeters);
    return Math.max(this.sensorCount, fromDistance);
  }
}
