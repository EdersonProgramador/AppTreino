import { create } from "zustand";
import { musicAudio } from "../lib/music-audio";
import { isNativeAppShell } from "../lib/native-bridge";
import {
  nativeMusicNext,
  nativeMusicPause,
  nativeMusicPlay,
  nativeMusicPlayAt,
  nativeMusicPrev,
  nativeMusicSeek,
  nativeMusicStop,
  nativeOpenMusicQueue
} from "../lib/native-music";

export type MusicPlayTrack = {
  id: string;
  title: string;
  artist: string | null;
  audioUrl: string;
  coverUrl: string | null;
  durationSec: number | null;
  albumId?: string | null;
};

export type RepeatMode = "off" | "all" | "one";

const VOLUME_KEY = "apptreino.music.volume";
const REPEAT_KEY = "apptreino.music.repeat";
const SHUFFLE_KEY = "apptreino.music.shuffle";
const LIKED_KEY = "apptreino.music.liked";
const QUEUE_KEY = "apptreino.music.session";

function readNumber(key: string, fallback: number) {
  if (typeof localStorage === "undefined") return fallback;
  const raw = Number(localStorage.getItem(key));
  return Number.isFinite(raw) ? raw : fallback;
}

function readStoredVolume() {
  return Math.min(1, Math.max(0, readNumber(VOLUME_KEY, 0.85)));
}

function readRepeat(): RepeatMode {
  if (typeof localStorage === "undefined") return "off";
  const value = localStorage.getItem(REPEAT_KEY);
  return value === "all" || value === "one" ? value : "off";
}

function readShuffle() {
  return typeof localStorage !== "undefined" && localStorage.getItem(SHUFFLE_KEY) === "1";
}

function readLiked(): string[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(LIKED_KEY) ?? "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function persist(key: string, value: string) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(key, value);
}

function isTrack(value: unknown): value is MusicPlayTrack {
  if (!value || typeof value !== "object") return false;
  const track = value as MusicPlayTrack;
  return typeof track.id === "string" && typeof track.audioUrl === "string" && typeof track.title === "string";
}

type StoredSession = {
  sourceQueue: MusicPlayTrack[];
  queue: MusicPlayTrack[];
  index: number;
  playing: boolean;
  progress: number;
  duration: number;
};

function readStoredSession(): StoredSession | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "null") as Partial<StoredSession> | null;
    if (!parsed || !Array.isArray(parsed.queue) || !parsed.queue.every(isTrack)) return null;
    const queue = parsed.queue;
    const sourceQueue = Array.isArray(parsed.sourceQueue) && parsed.sourceQueue.every(isTrack) ? parsed.sourceQueue : queue;
    const index = Math.min(Math.max(0, Number(parsed.index) || 0), Math.max(0, queue.length - 1));
    return {
      sourceQueue,
      queue,
      index,
      playing: Boolean(parsed.playing),
      progress: Number.isFinite(Number(parsed.progress)) ? Number(parsed.progress) : 0,
      duration: Number.isFinite(Number(parsed.duration)) ? Number(parsed.duration) : 0
    };
  } catch {
    return null;
  }
}

function persistSession(state: {
  sourceQueue: MusicPlayTrack[];
  queue: MusicPlayTrack[];
  index: number;
  playing: boolean;
  progress: number;
  duration: number;
}) {
  if (typeof localStorage === "undefined") return;
  try {
    if (!state.queue.length) {
      localStorage.removeItem(QUEUE_KEY);
      return;
    }
    localStorage.setItem(
      QUEUE_KEY,
      JSON.stringify({
        sourceQueue: state.sourceQueue,
        queue: state.queue,
        index: state.index,
        playing: state.playing,
        progress: state.progress,
        duration: state.duration
      } satisfies StoredSession)
    );
  } catch {
    // ignore
  }
}

const restoredSession = readStoredSession();

function shuffleArray<T>(items: T[]) {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function buildQueue(tracks: MusicPlayTrack[], startIndex: number, shuffle: boolean) {
  const safeIndex = Math.min(Math.max(0, startIndex), Math.max(0, tracks.length - 1));
  if (!shuffle || tracks.length < 2) {
    return { queue: tracks, index: safeIndex };
  }
  const current = tracks[safeIndex];
  const rest = tracks.filter((_, index) => index !== safeIndex);
  return { queue: current ? [current, ...shuffleArray(rest)] : tracks, index: 0 };
}

type MusicPlayerState = {
  sourceQueue: MusicPlayTrack[];
  queue: MusicPlayTrack[];
  index: number;
  playing: boolean;
  progress: number;
  duration: number;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  expanded: boolean;
  /** Mini player dismissed by swipe; audio keeps playing. */
  miniHidden: boolean;
  queueOpen: boolean;
  likedIds: string[];
  seekRatio: number | null;
  seekToken: number;
  startQueue: (tracks: MusicPlayTrack[], startIndex?: number, options?: { expand?: boolean; shuffle?: boolean }) => void;
  startQueueAndPlay: (
    tracks: MusicPlayTrack[],
    startIndex?: number,
    options?: { expand?: boolean; shuffle?: boolean }
  ) => Promise<boolean>;
  /** Inicia fila sem tocar (ex.: player nativo no Expo). */
  armQueue: (tracks: MusicPlayTrack[], startIndex?: number, options?: { expand?: boolean; shuffle?: boolean }) => void;
  playAt: (index: number) => void;
  setPlaying: (playing: boolean) => void;
  toggle: () => void;
  next: () => void;
  prev: () => void;
  ended: () => void;
  setProgress: (progress: number) => void;
  setDuration: (duration: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  toggleLike: (id?: string) => void;
  expand: () => void;
  collapse: () => void;
  hideMiniDock: () => void;
  showMiniDock: () => void;
  toggleQueueOpen: () => void;
  seek: (ratio: number) => void;
  consumeSeek: () => void;
  reset: () => void;
  hydrateFromNative: (
    tracks: MusicPlayTrack[],
    index: number,
    playing: boolean,
    progress: number,
    duration: number
  ) => void;
};

export const useMusicPlayerStore = create<MusicPlayerState>((set, get) => ({
  sourceQueue: restoredSession?.sourceQueue ?? [],
  queue: restoredSession?.queue ?? [],
  index: restoredSession?.index ?? 0,
  playing: restoredSession?.playing ?? false,
  progress: restoredSession?.progress ?? 0,
  duration: restoredSession?.duration ?? 0,
  volume: readStoredVolume(),
  muted: false,
  shuffle: readShuffle(),
  repeat: readRepeat(),
  expanded: false,
  miniHidden: false,
  queueOpen: false,
  likedIds: readLiked(),
  seekRatio: null,
  seekToken: 0,
  startQueue: (tracks, startIndex = 0, options) => {
    if (!tracks.length) return;
    const shuffle = options?.shuffle ?? get().shuffle;
    if (options?.shuffle != null && options.shuffle !== get().shuffle) {
      persist(SHUFFLE_KEY, options.shuffle ? "1" : "0");
    }
    const built = buildQueue(tracks, startIndex, shuffle);
    set({
      sourceQueue: tracks,
      queue: built.queue,
      index: built.index,
      playing: false,
      progress: 0,
      duration: built.queue[built.index]?.durationSec ?? 0,
      shuffle,
      expanded: options?.expand ?? false,
      miniHidden: false,
      queueOpen: false
    });
    persistSession(get());
  },
  armQueue: (tracks, startIndex = 0, options) => {
    get().startQueue(tracks, startIndex, options);
  },
  /**
   * Play no gesto do clique: inicia o áudio ANTES de notificar o React/Zustand
   * (subscribers síncronos podem “gastar” a user activation no Safari/Chrome).
   */
  startQueueAndPlay: async (tracks, startIndex = 0, options) => {
    if (!tracks.length) return false;
    const shuffle = options?.shuffle ?? get().shuffle;
    if (options?.shuffle != null && options.shuffle !== get().shuffle) {
      persist(SHUFFLE_KEY, options.shuffle ? "1" : "0");
    }
    const built = buildQueue(tracks, startIndex, shuffle);
    const current = built.queue[built.index];
    if (!current?.audioUrl) {
      set({ playing: false });
      return false;
    }

    const volume = get().volume;
    const muted = get().muted;
    // 1) Dispara play ainda no turno do clique
    const resultPromise = musicAudio.playSource(current.audioUrl, volume, muted, { fromStart: true });

    // 2) Só então atualiza a UI
    set({
      sourceQueue: tracks,
      queue: built.queue,
      index: built.index,
      playing: false,
      progress: 0,
      duration: current.durationSec ?? 0,
      shuffle,
      expanded: options?.expand ?? false,
      miniHidden: false,
      queueOpen: false
    });

    const result = await resultPromise;
    set({ playing: result.ok });
    return result.ok;
  },
  playAt: (index) => {
    const { queue } = get();
    if (!queue[index]) return;
    set({ index, playing: true, progress: 0, duration: queue[index].durationSec ?? 0 });
    if (isNativeAppShell()) {
      musicAudio.stop();
      nativeMusicPlayAt(index);
      return;
    }
    const track = queue[index];
    void musicAudio.playSource(track.audioUrl, get().volume, get().muted, { fromStart: true }).then((result) => {
      set({ playing: Boolean(result.ok) });
    });
  },
  setPlaying: (playing) => {
    set({ playing });
    if (isNativeAppShell()) {
      musicAudio.stop();
      if (playing) nativeMusicPlay();
      else nativeMusicPause();
      return;
    }
    if (playing) {
      const current = get().queue[get().index];
      if (current?.audioUrl) {
        void musicAudio.playSource(current.audioUrl, get().volume, get().muted, { fromStart: false }).then((result) => {
          if (!result.ok) set({ playing: false });
        });
      }
    } else {
      musicAudio.pause();
    }
  },
  toggle: () => {
    const next = !get().playing;
    get().setPlaying(next);
  },
  next: () => {
    const { queue, index, repeat } = get();
    if (!queue.length) return;
    if (isNativeAppShell()) {
      musicAudio.stop();
      if (index < queue.length - 1) {
        set({ index: index + 1, progress: 0, playing: true, duration: queue[index + 1]?.durationSec ?? 0 });
        nativeMusicNext();
        return;
      }
      if (repeat === "all") {
        set({ index: 0, progress: 0, playing: true, duration: queue[0]?.durationSec ?? 0 });
        nativeMusicNext();
        return;
      }
      set({ playing: false, progress: 0 });
      nativeMusicPause();
      return;
    }
    if (index < queue.length - 1) {
      set({ index: index + 1, progress: 0, playing: false, duration: queue[index + 1]?.durationSec ?? 0 });
    } else if (repeat === "all") {
      set({ index: 0, progress: 0, playing: false, duration: queue[0]?.durationSec ?? 0 });
    } else {
      set({ playing: false, progress: 0, seekRatio: 0, seekToken: Date.now() });
      musicAudio.pause();
      return;
    }
    const track = get().queue[get().index];
    if (track?.audioUrl) {
      void musicAudio.playSource(track.audioUrl, get().volume, get().muted, { fromStart: true }).then((result) => {
        set({ playing: Boolean(result.ok) });
      });
    }
  },
  prev: () => {
    const { queue, index, progress, repeat, playing } = get();
    if (!queue.length) return;
    if (isNativeAppShell()) {
      musicAudio.stop();
      nativeMusicPrev();
      if (progress > 3) {
        set({ progress: 0, playing });
        return;
      }
      if (index > 0) {
        set({ index: index - 1, progress: 0, playing, duration: queue[index - 1]?.durationSec ?? 0 });
      } else if (repeat === "all") {
        const last = queue.length - 1;
        set({ index: last, progress: 0, playing, duration: queue[last]?.durationSec ?? 0 });
      } else {
        set({ progress: 0, playing });
      }
      return;
    }
    if (progress > 3) {
      set({ seekRatio: 0, seekToken: Date.now(), progress: 0, playing: true });
      void musicAudio.play().then((result) => {
        if (!result.ok) set({ playing: false });
      });
      return;
    }
    if (index > 0) {
      set({ index: index - 1, progress: 0, playing: false, duration: queue[index - 1]?.durationSec ?? 0 });
    } else if (repeat === "all") {
      const last = queue.length - 1;
      set({ index: last, progress: 0, playing: false, duration: queue[last]?.durationSec ?? 0 });
    } else {
      set({ seekRatio: 0, seekToken: Date.now(), progress: 0, playing: true });
      void musicAudio.play().then((result) => {
        if (!result.ok) set({ playing: false });
      });
      return;
    }
    const track = get().queue[get().index];
    if (track?.audioUrl) {
      void musicAudio.playSource(track.audioUrl, get().volume, get().muted, { fromStart: true }).then((result) => {
        set({ playing: Boolean(result.ok) });
      });
    }
  },
  ended: () => {
    const { repeat, queue, index } = get();
    if (repeat === "one") {
      set({ seekRatio: 0, seekToken: Date.now(), progress: 0, playing: true });
      if (isNativeAppShell()) {
        nativeMusicSeek(0);
        nativeMusicPlay();
        return;
      }
      void musicAudio.play();
      return;
    }
    if (index < queue.length - 1 || repeat === "all") {
      get().next();
      return;
    }
    set({ playing: false, progress: 0 });
    if (isNativeAppShell()) nativeMusicPause();
    else musicAudio.pause();
  },
  setProgress: (progress) => set({ progress }),
  setDuration: (duration) => set({ duration }),
  setVolume: (volume) => {
    const next = Math.min(1, Math.max(0, volume));
    persist(VOLUME_KEY, String(next));
    set({ volume: next, muted: next === 0 });
    if (!isNativeAppShell()) musicAudio.setVolume(next, next === 0);
  },
  toggleMute: () => {
    const { muted, volume } = get();
    if (muted) {
      const restored = volume > 0 ? volume : 0.85;
      persist(VOLUME_KEY, String(restored));
      set({ muted: false, volume: restored });
      if (!isNativeAppShell()) musicAudio.setVolume(restored, false);
      return;
    }
    set({ muted: true });
    if (!isNativeAppShell()) musicAudio.setVolume(volume, true);
  },
  toggleShuffle: () => {
    const { shuffle, sourceQueue, queue, index } = get();
    const current = queue[index];
    const nextShuffle = !shuffle;
    persist(SHUFFLE_KEY, nextShuffle ? "1" : "0");
    if (!current || sourceQueue.length < 2) {
      set({ shuffle: nextShuffle });
      return;
    }
    const startIndex = Math.max(
      0,
      sourceQueue.findIndex((track) => track.id === current.id)
    );
    const built = buildQueue(sourceQueue, startIndex, nextShuffle);
    set({ shuffle: nextShuffle, queue: built.queue, index: built.index });
    if (isNativeAppShell()) {
      nativeOpenMusicQueue(built.queue, built.index, {
        autoplay: get().playing,
        resumeSec: get().progress
      });
    }
  },
  cycleRepeat: () => {
    const order: RepeatMode[] = ["off", "all", "one"];
    const next = order[(order.indexOf(get().repeat) + 1) % order.length];
    persist(REPEAT_KEY, next);
    set({ repeat: next });
  },
  toggleLike: (id) => {
    const trackId = id ?? get().queue[get().index]?.id;
    if (!trackId) return;
    const liked = new Set(get().likedIds);
    if (liked.has(trackId)) liked.delete(trackId);
    else liked.add(trackId);
    const likedIds = [...liked];
    persist(LIKED_KEY, JSON.stringify(likedIds));
    set({ likedIds });
  },
  expand: () => set({ expanded: true, miniHidden: false }),
  collapse: () => set({ expanded: false, queueOpen: false }),
  hideMiniDock: () => set({ miniHidden: true }),
  showMiniDock: () => set({ miniHidden: false }),
  toggleQueueOpen: () => set({ queueOpen: !get().queueOpen }),
  seek: (ratio) => {
    const next = Math.min(1, Math.max(0, ratio));
    if (isNativeAppShell()) {
      const total = get().duration;
      set({
        seekRatio: next,
        seekToken: Date.now(),
        progress: total > 0 ? total * next : get().progress
      });
      nativeMusicSeek(next);
      return;
    }
    const time = musicAudio.seekRatio(next, get().duration);
    const total = musicAudio.getDuration() || get().duration;
    set({
      progress: time ?? (total > 0 ? total * next : get().progress),
      duration: total > 0 ? total : get().duration
    });
  },
  consumeSeek: () => set({ seekRatio: null }),
  hydrateFromNative: (tracks, index, playing, progress, duration) => {
    if (!tracks.length) return;
    const safeIndex = Math.min(Math.max(0, index), tracks.length - 1);
    set({
      sourceQueue: tracks,
      queue: tracks,
      index: safeIndex,
      playing,
      progress,
      duration: duration > 0 ? duration : tracks[safeIndex]?.durationSec ?? 0
    });
    persistSession(get());
  },
  reset: () => {
    if (isNativeAppShell()) nativeMusicStop();
    musicAudio.stop();
    persistSession({
      sourceQueue: [],
      queue: [],
      index: 0,
      playing: false,
      progress: 0,
      duration: 0
    });
    set({
      sourceQueue: [],
      queue: [],
      index: 0,
      playing: false,
      progress: 0,
      duration: 0,
      expanded: false,
      miniHidden: false,
      queueOpen: false,
      seekRatio: null
    });
  }
}));

if (typeof window !== "undefined") {
  let lastPersist = 0;
  useMusicPlayerStore.subscribe((state) => {
    const now = Date.now();
    if (now - lastPersist < 1200) return;
    lastPersist = now;
    persistSession(state);
  });
}
