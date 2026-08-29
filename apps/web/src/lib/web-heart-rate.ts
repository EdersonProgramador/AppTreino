type HeartRateCallback = (bpm: number, connected: boolean) => void;

type BleDevice = {
  gatt?: {
    connected?: boolean;
    connect: () => Promise<{
      getPrimaryService: (service: number) => Promise<{
        getCharacteristic: (char: number) => Promise<{
          startNotifications: () => Promise<unknown>;
          addEventListener: (type: string, listener: (event: Event) => void) => void;
          removeEventListener: (type: string, listener: (event: Event) => void) => void;
        }>;
      }>;
    }>;
    disconnect: () => void;
  };
  addEventListener: (type: string, listener: () => void) => void;
};

const HR_SERVICE = 0x180d;
const HR_MEASUREMENT = 0x2a37;

export function parseHeartRateMeasurement(data: DataView): number {
  if (data.byteLength < 2) return 0;
  const flags = data.getUint8(0);
  const bpm = flags & 0x1 ? data.getUint16(1, true) : data.getUint8(1);
  return Number.isFinite(bpm) && bpm >= 30 && bpm <= 250 ? bpm : 0;
}

export class WebHeartRateMonitor {
  private device: BleDevice | null = null;
  private characteristic: {
    addEventListener: (type: string, listener: (event: Event) => void) => void;
    removeEventListener: (type: string, listener: (event: Event) => void) => void;
  } | null = null;
  private bpm = 0;
  private listener: HeartRateCallback | null = null;
  private samples: number[] = [];

  readonly onValue = (event: Event) => {
    const target = event.target as { value?: DataView } | null;
    if (!target?.value) return;
    const next = parseHeartRateMeasurement(target.value);
    if (!next) return;
    this.bpm = next;
    this.samples.push(next);
    if (this.samples.length > 2400) this.samples.splice(0, this.samples.length - 1800);
    this.listener?.(next, true);
  };

  static isSupported() {
    return typeof navigator !== "undefined" && "bluetooth" in navigator;
  }

  onChange(cb: HeartRateCallback | null) {
    this.listener = cb;
  }

  getBpm() {
    return this.bpm;
  }

  isConnected() {
    return Boolean(this.device?.gatt?.connected);
  }

  averageBpm() {
    if (!this.samples.length) return this.bpm || 0;
    const sum = this.samples.reduce((acc, n) => acc + n, 0);
    return Math.round(sum / this.samples.length);
  }

  async connect() {
    const bluetooth = (navigator as Navigator & { bluetooth?: { requestDevice: (opts: unknown) => Promise<BleDevice> } })
      .bluetooth;
    if (!bluetooth) {
      throw new Error("Bluetooth não disponível neste navegador. Use Chrome ou Edge com uma cinta/relógio BLE.");
    }
    this.disconnect();
    const device = await bluetooth.requestDevice({
      filters: [{ services: [HR_SERVICE] }],
      optionalServices: [HR_SERVICE]
    });
    this.device = device;
    device.addEventListener("gattserverdisconnected", () => {
      this.bpm = 0;
      this.listener?.(0, false);
    });
    const server = await device.gatt?.connect();
    if (!server) throw new Error("Não foi possível conectar ao sensor.");
    const service = await server.getPrimaryService(HR_SERVICE);
    const characteristic = await service.getCharacteristic(HR_MEASUREMENT);
    this.characteristic = characteristic;
    characteristic.addEventListener("characteristicvaluechanged", this.onValue);
    await characteristic.startNotifications();
    this.listener?.(this.bpm, true);
  }

  disconnect() {
    try {
      this.characteristic?.removeEventListener("characteristicvaluechanged", this.onValue);
    } catch {
      /* ignore */
    }
    try {
      this.device?.gatt?.disconnect();
    } catch {
      /* ignore */
    }
    this.characteristic = null;
    this.device = null;
    this.bpm = 0;
    this.listener?.(0, false);
  }

  resetSamples() {
    this.samples = [];
    this.bpm = 0;
  }
}
