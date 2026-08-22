import { Platform } from "react-native";
import type { LocationBridge } from "./LocationBridge";
import { ExpoLocationBridge } from "./ExpoLocationBridge";
import { BareLocationBridge } from "./BareLocationBridge";

/**
 * Expo managed/prebuild → ExpoLocationBridge
 * Bare puro (android/ios nativos sem Expo Go) → BareLocationBridge
 *
 * Force: EXPO_PUBLIC_TRACKING_BRIDGE=bare|expo
 */
export function createLocationBridge(): LocationBridge {
  const forced = (process.env.EXPO_PUBLIC_TRACKING_BRIDGE ?? "").toLowerCase();
  if (forced === "bare") return new BareLocationBridge();
  if (forced === "expo") return new ExpoLocationBridge();

  // Heurística: builds bare clássicos costumam não ter Constants.executionEnvironment = storeClient
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Constants = require("expo-constants").default as {
      executionEnvironment?: string;
      appOwnership?: string | null;
    };
    const isExpoGo = Constants.executionEnvironment === "storeClient" || Constants.appOwnership === "expo";
    if (isExpoGo) return new ExpoLocationBridge();
    // Dev client / prebuild ainda usa Expo Location (nativo linkado)
    if (Constants.executionEnvironment === "bare" && Platform.OS !== "web") {
      // Preferir Expo bridge enquanto o projeto for Expo prebuild;
      // troque para Bare após eject completo + geolocation-service.
      return new ExpoLocationBridge();
    }
  } catch {
    return new BareLocationBridge();
  }

  return new ExpoLocationBridge();
}
