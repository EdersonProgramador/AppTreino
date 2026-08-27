/**
 * Bússola do mapa: magnetômetro + giroscópio (complementar).
 * DeviceMotion entra quando o SO já entrega heading; senão fusiona mag+gyro.
 */
type HeadingListener = (headingDeg: number) => void;

function normalize(deg: number) {
  let value = deg % 360;
  if (value < 0) value += 360;
  return value;
}

class HeadingBridge {
  private unsubs: Array<() => void> = [];
  private listeners = new Set<HeadingListener>();
  private heading = 0;
  private lastGyroT = 0;
  private running = false;

  subscribe(listener: HeadingListener) {
    this.listeners.add(listener);
    listener(this.heading);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getHeading() {
    return this.heading;
  }

  async start() {
    if (this.running) return;
    this.running = true;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const sensors = require("expo-sensors") as {
        DeviceMotion?: {
          isAvailableAsync?: () => Promise<boolean>;
          setUpdateInterval: (ms: number) => void;
          addListener: (cb: (event: { rotation?: { alpha?: number } }) => void) => { remove: () => void };
        };
        Magnetometer: {
          isAvailableAsync?: () => Promise<boolean>;
          setUpdateInterval: (ms: number) => void;
          addListener: (cb: (event: { x: number; y: number; z: number }) => void) => { remove: () => void };
        };
        Gyroscope: {
          isAvailableAsync?: () => Promise<boolean>;
          setUpdateInterval: (ms: number) => void;
          addListener: (cb: (event: { x: number; y: number; z: number }) => void) => { remove: () => void };
        };
      };

      const motionOk = sensors.DeviceMotion?.isAvailableAsync ? await sensors.DeviceMotion.isAvailableAsync() : false;
      if (motionOk && sensors.DeviceMotion) {
        sensors.DeviceMotion.setUpdateInterval(120);
        const sub = sensors.DeviceMotion.addListener((event) => {
          const alpha = event.rotation?.alpha;
          if (typeof alpha !== "number" || !Number.isFinite(alpha)) return;
          this.emit(normalize((alpha * 180) / Math.PI));
        });
        this.unsubs.push(() => sub.remove());
      }

      const magOk = sensors.Magnetometer.isAvailableAsync ? await sensors.Magnetometer.isAvailableAsync() : true;
      if (magOk) {
        sensors.Magnetometer.setUpdateInterval(100);
        const sub = sensors.Magnetometer.addListener((event) => {
          const magHeading = normalize((Math.atan2(event.y, event.x) * 180) / Math.PI);
          this.emit(this.heading === 0 ? magHeading : this.heading * 0.15 + magHeading * 0.85);
        });
        this.unsubs.push(() => sub.remove());
      }

      const gyroOk = sensors.Gyroscope.isAvailableAsync ? await sensors.Gyroscope.isAvailableAsync() : true;
      if (gyroOk) {
        sensors.Gyroscope.setUpdateInterval(80);
        this.lastGyroT = Date.now();
        const sub = sensors.Gyroscope.addListener((event) => {
          const now = Date.now();
          const dt = Math.min(0.25, (now - this.lastGyroT) / 1000);
          this.lastGyroT = now;
          const zDeg = (event.z * 180) / Math.PI;
          this.emit(this.heading + zDeg * dt * 0.35);
        });
        this.unsubs.push(() => sub.remove());
      }
    } catch {
      this.running = false;
    }
  }

  async stop() {
    for (const unsub of this.unsubs) unsub();
    this.unsubs = [];
    this.running = false;
  }

  private emit(next: number) {
    this.heading = normalize(next);
    for (const listener of this.listeners) listener(this.heading);
  }
}

export const headingBridge = new HeadingBridge();
