import Constants from "expo-constants";
import { PermissionsAndroid, Platform } from "react-native";

export type BackgroundTrack = {
  id: string;
  url: string;
  title: string;
  artist: string;
  artwork?: string;
};

type RntpModule = typeof import("react-native-track-player");

export type TrackPlayerRuntime = {
  TrackPlayer: RntpModule["default"];
  Capability: RntpModule["Capability"];
  Event: RntpModule["Event"];
  State: RntpModule["State"];
  RepeatMode: RntpModule["RepeatMode"];
  AppKilledPlaybackBehavior: RntpModule["AppKilledPlaybackBehavior"];
};

let runtime: TrackPlayerRuntime | null | undefined;
let setupPromise: Promise<boolean> | null = null;

export function isExpoGo() {
  return Constants.appOwnership === "expo";
}

function loadRuntime(): TrackPlayerRuntime | null {
  if (runtime !== undefined) return runtime;
  if (isExpoGo()) {
    runtime = null;
    return null;
  }
  try {
    const mod = require("react-native-track-player") as RntpModule & {
      default?: RntpModule["default"];
    };
    const TrackPlayer = (typeof (mod as { setupPlayer?: unknown }).setupPlayer === "function"
      ? mod
      : (mod.default ?? mod)) as RntpModule["default"];
    const ns = TrackPlayer as unknown as RntpModule;
    runtime = {
      TrackPlayer,
      Capability: mod.Capability ?? ns.Capability,
      Event: mod.Event ?? ns.Event,
      State: mod.State ?? ns.State,
      RepeatMode: mod.RepeatMode ?? ns.RepeatMode,
      AppKilledPlaybackBehavior: mod.AppKilledPlaybackBehavior ?? ns.AppKilledPlaybackBehavior
    };
    return runtime;
  } catch {
    runtime = null;
    return null;
  }
}

export function getTrackPlayerRuntime() {
  return loadRuntime();
}

async function requestNotificationPermission() {
  if (Platform.OS !== "android") return;
  if (Number(Platform.Version) < 33) return;
  try {
    await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
  } catch {
    // sem notificação o Android mata o foreground service
  }
}

/**
 * Ativa o player nativo com serviço em segundo plano + controles na tela de bloqueio.
 * Só existe em development/production build — Expo Go Android não tem o módulo.
 */
export async function setupTrackPlayerIfAvailable(): Promise<boolean> {
  if (setupPromise) return setupPromise;
  setupPromise = (async () => {
    const rntp = loadRuntime();
    if (!rntp) return false;
    await requestNotificationPermission();
    try {
      await rntp.TrackPlayer.setupPlayer({
        autoHandleInterruptions: true
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/already been initialized/i.test(message)) {
        setupPromise = null;
        return false;
      }
    }
    await rntp.TrackPlayer.updateOptions({
      android: {
        appKilledPlaybackBehavior: rntp.AppKilledPlaybackBehavior.ContinuePlayback
      },
      capabilities: [
        rntp.Capability.Play,
        rntp.Capability.Pause,
        rntp.Capability.SkipToNext,
        rntp.Capability.SkipToPrevious,
        rntp.Capability.Stop,
        rntp.Capability.SeekTo
      ],
      compactCapabilities: [
        rntp.Capability.Play,
        rntp.Capability.Pause,
        rntp.Capability.SkipToNext,
        rntp.Capability.SkipToPrevious
      ],
      notificationCapabilities: [
        rntp.Capability.Play,
        rntp.Capability.Pause,
        rntp.Capability.SkipToNext,
        rntp.Capability.SkipToPrevious,
        rntp.Capability.Stop
      ],
      progressUpdateEventInterval: 1
    });
    await rntp.TrackPlayer.setRepeatMode(rntp.RepeatMode.Off);
    return true;
  })();
  return setupPromise;
}

export function toTrackPlayerTracks(tracks: BackgroundTrack[]) {
  return tracks.map((track) => ({
    id: track.id,
    url: track.url,
    title: track.title,
    artist: track.artist,
    artwork: track.artwork
  }));
}
