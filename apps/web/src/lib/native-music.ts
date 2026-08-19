import { absolutePlayableUrl } from "./music-audio";
import { isNativeAppShell, postNativeMessage } from "./native-bridge";
import type { MusicPlayTrack } from "../stores/musicPlayerStore";

export type NativeMusicTrackPayload = {
  id: string;
  title: string;
  artist: string;
  artwork?: string;
  url: string;
};

export function toNativeMusicTracks(tracks: MusicPlayTrack[]): NativeMusicTrackPayload[] {
  return tracks.map((track) => ({
    id: track.id,
    title: track.title,
    artist: track.artist || "App Treino",
    artwork: track.coverUrl ? absolutePlayableUrl(track.coverUrl) : undefined,
    url: absolutePlayableUrl(track.audioUrl)
  }));
}

export function fromNativeMusicTracks(tracks: NativeMusicTrackPayload[]): MusicPlayTrack[] {
  return tracks
    .filter((track) => track?.id && track.url)
    .map((track) => ({
      id: track.id,
      title: track.title,
      artist: track.artist || "App Treino",
      audioUrl: track.url,
      coverUrl: track.artwork ?? null,
      durationSec: null
    }));
}

/** Abre/atualiza a fila no player nativo (mobile). UI continua no web (dock). */
export function nativeOpenMusicQueue(
  tracks: MusicPlayTrack[],
  startIndex: number,
  options?: { autoplay?: boolean; resumeSec?: number }
) {
  if (!isNativeAppShell() || !tracks.length) return false;
  const safeIndex = Math.min(Math.max(0, startIndex), tracks.length - 1);
  return postNativeMessage({
    type: "OPEN_MUSIC_PLAYER",
    startIndex: safeIndex,
    tracks: toNativeMusicTracks(tracks),
    autoplay: options?.autoplay,
    resumeSec: options?.resumeSec
  });
}

export function nativeRequestMusicSync() {
  return isNativeAppShell() && postNativeMessage({ type: "MUSIC_SYNC" });
}

export function nativeMusicPlay() {
  return isNativeAppShell() && postNativeMessage({ type: "MUSIC_PLAY" });
}

export function nativeMusicPause() {
  return isNativeAppShell() && postNativeMessage({ type: "MUSIC_PAUSE" });
}

export function nativeMusicNext() {
  return isNativeAppShell() && postNativeMessage({ type: "MUSIC_NEXT" });
}

export function nativeMusicPrev() {
  return isNativeAppShell() && postNativeMessage({ type: "MUSIC_PREV" });
}

export function nativeMusicStop() {
  return isNativeAppShell() && postNativeMessage({ type: "MUSIC_STOP" });
}

export function nativeMusicSeek(ratio: number) {
  return isNativeAppShell() && postNativeMessage({ type: "MUSIC_SEEK", ratio });
}

export function nativeMusicPlayAt(index: number) {
  return isNativeAppShell() && postNativeMessage({ type: "MUSIC_PLAY_AT", index });
}

export type NativeMusicSyncPayload = {
  playing?: boolean;
  progress?: number;
  duration?: number;
  index?: number;
  ended?: boolean;
  tracks?: NativeMusicTrackPayload[];
};

type SyncHandler = (payload: NativeMusicSyncPayload) => void;

const syncHandlers = new Set<SyncHandler>();

export function subscribeNativeMusicSync(handler: SyncHandler) {
  syncHandlers.add(handler);
  return () => {
    syncHandlers.delete(handler);
  };
}

export function installNativeMusicSyncBridge() {
  if (typeof window === "undefined") return;
  const root = window as Window & {
    __nativeMusicSync?: (payload: NativeMusicSyncPayload) => void;
  };
  root.__nativeMusicSync = (payload) => {
    syncHandlers.forEach((handler) => handler(payload ?? {}));
  };
}
