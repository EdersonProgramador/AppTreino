import { PermissionsAndroid, Platform } from "react-native";
import type { RawFix, Sport } from "../types";
import type { LocationBridge, LocationPermission } from "./LocationBridge";
import { SPORT_LOCATION_OPTIONS } from "./LocationBridge";

type GeoError = { code?: number; message?: string };
type GeoPosition = {
  timestamp?: number;
  coords: {
    latitude: number;
    longitude: number;
    altitude?: number | null;
    accuracy?: number | null;
    speed?: number | null;
    heading?: number | null;
  };
};

type GeolocationModule = {
  requestAuthorization?: (level?: "whenInUse" | "always") => Promise<"granted" | "denied" | "disabled" | string>;
  getCurrentPosition: (
    success: (pos: GeoPosition) => void,
    error?: (err: GeoError) => void,
    options?: Record<string, unknown>
  ) => void;
  watchPosition: (
    success: (pos: GeoPosition) => void,
    error?: (err: GeoError) => void,
    options?: Record<string, unknown>
  ) => number;
  clearWatch: (id: number) => void;
};

function loadGeolocation(): GeolocationModule | null {
  try {
    // Preferido em Bare puro
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("react-native-geolocation-service") as GeolocationModule;
  } catch {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require("@react-native-community/geolocation") as GeolocationModule;
    } catch {
      return null;
    }
  }
}

/**
 * Bridge Bare RN.
 * Requer `react-native-geolocation-service` (ou community geolocation) +
 * Foreground Service Android / UIBackgroundModes location no nativo.
 */
export class BareLocationBridge implements LocationBridge {
  private geo: GeolocationModule | null = null;
  private watchId: number | null = null;
  private listeners = new Set<(fix: RawFix) => void>();

  private module(): GeolocationModule {
    if (!this.geo) this.geo = loadGeolocation();
    if (!this.geo) {
      throw new Error(
        "BareLocationBridge: instale react-native-geolocation-service (ou @react-native-community/geolocation)."
      );
    }
    return this.geo;
  }

  private toFix(pos: GeoPosition): RawFix {
    return {
      t: pos.timestamp || Date.now(),
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      ele: pos.coords.altitude ?? null,
      accuracyM: pos.coords.accuracy ?? null,
      speedMps: pos.coords.speed != null && pos.coords.speed >= 0 ? pos.coords.speed : null,
      heading: pos.coords.heading != null && pos.coords.heading >= 0 ? pos.coords.heading : null
    };
  }

  async requestPermissions(): Promise<LocationPermission> {
    if (Platform.OS === "android") {
      const fine = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
      const foreground = fine === PermissionsAndroid.RESULTS.GRANTED;
      let background = false;
      if (foreground && Platform.Version >= 29) {
        const bg = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION
        );
        background = bg === PermissionsAndroid.RESULTS.GRANTED;
      }
      return { foreground, background };
    }

    const geo = this.module();
    if (geo.requestAuthorization) {
      const status = await geo.requestAuthorization("always");
      const granted = status === "granted";
      return { foreground: granted, background: granted };
    }
    return { foreground: true, background: false };
  }

  async getCurrentFix(): Promise<RawFix | null> {
    const geo = this.module();
    return new Promise((resolve) => {
      geo.getCurrentPosition(
        (pos) => resolve(this.toFix(pos)),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000, forceRequestLocation: true }
      );
    });
  }

  async start(_sessionId: string, sport: Sport): Promise<void> {
    await this.stop();
    const geo = this.module();
    const cfg = SPORT_LOCATION_OPTIONS[sport];
    this.watchId = geo.watchPosition(
      (pos) => {
        const fix = this.toFix(pos);
        for (const listener of this.listeners) listener(fix);
      },
      () => undefined,
      {
        enableHighAccuracy: cfg.accuracy !== "balanced",
        distanceFilter: cfg.distanceIntervalM,
        interval: cfg.timeIntervalMs,
        fastestInterval: Math.max(500, Math.floor(cfg.timeIntervalMs / 2)),
        forceRequestLocation: true,
        showLocationDialog: true,
        useSignificantChanges: false
      }
    );
  }

  async stop(): Promise<void> {
    if (this.watchId != null) {
      try {
        this.module().clearWatch(this.watchId);
      } catch {
        // ignore
      }
      this.watchId = null;
    }
  }

  subscribe(handler: (fix: RawFix) => void): () => void {
    this.listeners.add(handler);
    return () => {
      this.listeners.delete(handler);
    };
  }
}
