import { PermissionsAndroid, Platform } from "react-native";
import { pedometerBridge } from "../tracking/sensors/PedometerBridge";

export type TodayHealthSnapshot = {
  steps: number | null;
  source: "pedometer" | "none";
};

export async function requestMotionPermissions() {
  if (Platform.OS === "android") {
    const activityKey = "android.permission.ACTIVITY_RECOGNITION";
    const heartKey = "android.permission.BODY_SENSORS";
    const result = (await PermissionsAndroid.requestMultiple([activityKey, heartKey] as never)) as Record<string, string>;
    const activity = result[activityKey] === PermissionsAndroid.RESULTS.GRANTED;
    const heart = result[heartKey] === PermissionsAndroid.RESULTS.GRANTED;
    return { activity, heart, steps: activity };
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Pedometer } = require("expo-sensors");
    if (typeof Pedometer.requestPermissionsAsync === "function") {
      const status = await Pedometer.requestPermissionsAsync();
      const ok = status?.granted === true || status?.status === "granted";
      return { activity: ok, steps: ok, heart: false };
    }
  } catch {
    // fallback
  }
  const available = await pedometerBridge.isAvailable();
  return { activity: available, steps: available, heart: false };
}

export async function readTodaySteps(): Promise<TodayHealthSnapshot> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Pedometer } = require("expo-sensors");
    if (typeof Pedometer.getStepCountAsync === "function") {
      const end = new Date();
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const result = await Pedometer.getStepCountAsync(start, end);
      if (typeof result?.steps === "number") return { steps: result.steps, source: "pedometer" };
    }
    const live = pedometerBridge.getTotalSteps();
    return { steps: live || null, source: live ? "pedometer" : "none" };
  } catch {
    return { steps: null, source: "none" };
  }
}