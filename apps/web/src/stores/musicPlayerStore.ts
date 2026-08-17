import { create } from "zustand";

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
  queueOpen: boolean;
  likedIds: string[];
  seekRatio: number | null;
  seekToken: number;
  startQueue: (tracks: MusicPlayTrack[], startIndex?: number, options?: { expand?: boolean; shuffle?: boolean }) => void;
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
  toggleQueueOpen: () => void;
  seek: (ratio: number) => void;
  consumeSeek: () => void;
  reset: () => void;
};

export const useMusicPlayerStore = create<MusicPlayerState>((set, get) => ({
  sourceQueue: [],
  queue: [],
  index: 0,
  playing: false,
  progress: 0,
  duration: 0,
  volume: readStoredVolume(),
  muted: false,
  shuffle: readShuffle(),
  repeat: readRepeat(),
  expanded: false,
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
      playing: true,
      progress: 0,
      duration: built.queue[built.index]?.durationSec ?? 0,
      shuffle,
      expanded: options?.expand ?? false,
      queueOpen: false
    });
  },
  playAt: (index) => {
    const { queue } = get();
    if (!queue[index]) return;
    set({ index, playing: true, progress: 0, duration: queue[index].durationSec ?? 0 });
  },
  setPlaying: (playing) => set({ playing }),
  toggle: () => set({ playing: !get().playing }),
  next: () => {
    const { queue, index, repeat } = get();
    if (!queue.length) return;
    if (index < queue.length - 1) {
      set({ index: index + 1, progress: 0, playing: true, duration: queue[index + 1]?.durationSec ?? 0 });
      return;
    }
    if (repeat === "all") {
      set({ index: 0, progress: 0, playing: true, duration: queue[0]?.durationSec ?? 0 });
      return;
    }
    set({ playing: false, progress: 0, seekRatio: 0, seekToken: Date.now() });
  },
  prev: () => {
    const { queue, index, progress, repeat } = get();
    if (!queue.length) return;
    if (progress > 3) {
      set({ seekRatio: 0, seekToken: Date.now(), progress: 0, playing: true });
      return;
    }
    if (index > 0) {
      set({ index: index - 1, progress: 0, playing: true, duration: queue[index - 1]?.durationSec ?? 0 });
      return;
    }
    if (repeat === "all") {
      const last = queue.length - 1;
      set({ index: last, progress: 0, playing: true, duration: queue[last]?.durationSec ?? 0 });
      return;
    }
    set({ seekRatio: 0, seekToken: Date.now(), progress: 0, playing: true });
  },
  ended: () => {
    const { repeat, queue, index } = get();
    if (repeat === "one") {
      set({ seekRatio: 0, seekToken: Date.now(), progress: 0, playing: true });
      return;
    }
    if (index < queue.length - 1 || repeat === "all") {
      get().next();
      return;
    }
    set({ playing: false, progress: 0 });
  },
  setProgress: (progress) => set({ progress }),
  setDuration: (duration) => set({ duration }),
  setVolume: (volume) => {
    const next = Math.min(1, Math.max(0, volume));
    persist(VOLUME_KEY, String(next));
    set({ volume: next, muted: next === 0 });
  },
  toggleMute: () => {
    const { muted, volume } = get();
    if (muted) {
      const restored = volume > 0 ? volume : 0.85;
      persist(VOLUME_KEY, String(restored));
      set({ muted: false, volume: restored });
      return;
    }
    set({ muted: true });
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
  expand: () => set({ expanded: true }),
  collapse: () => set({ expanded: false, queueOpen: false }),
  toggleQueueOpen: () => set({ queueOpen: !get().queueOpen }),
  seek: (ratio) => set({ seekRatio: Math.min(1, Math.max(0, ratio)), seekToken: Date.now() }),
  consumeSeek: () => set({ seekRatio: null }),
  reset: () =>
    set({
      sourceQueue: [],
      queue: [],
      index: 0,
      playing: false,
      progress: 0,
      duration: 0,
      expanded: false,
      queueOpen: false,
      seekRatio: null
    })
}));
