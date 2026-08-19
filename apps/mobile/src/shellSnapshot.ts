import AsyncStorage from "@react-native-async-storage/async-storage";
import { File, Paths } from "expo-file-system";
import type { NativeTrack } from "./musicPlayback";

export type ShellMusicSnapshot = {
  tracks: NativeTrack[];
  index: number;
  playing: boolean;
  /** Progresso da faixa em segundos (alias persistido: tempo_atual). */
  positionSec: number;
  tempo_atual: number;
};

export type ShellSnapshot = {
  href?: string;
  localStorage?: Record<string, string>;
  music?: ShellMusicSnapshot;
};

const STORAGE_KEY = "apptreino.shell.v1";
const LEGACY_FILE_NAME = "apptreino-shell-state.json";
const WRITE_DEBOUNCE_MS = 800;

let memory: ShellSnapshot = {};
let loaded = false;
let writeTimer: ReturnType<typeof setTimeout> | null = null;
let writeChain: Promise<void> = Promise.resolve();

type MusicSnapshotInput = {
  tracks: NativeTrack[];
  index?: number;
  playing?: boolean;
  positionSec?: number;
  tempo_atual?: number;
};

function toMusicSnapshot(input: MusicSnapshotInput | undefined | null): ShellMusicSnapshot | undefined {
  if (!input?.tracks?.length) return undefined;
  const tempo = Math.max(0, Number(input.tempo_atual ?? input.positionSec ?? 0) || 0);
  return {
    tracks: input.tracks,
    index: Math.max(0, Number(input.index) || 0),
    playing: Boolean(input.playing),
    positionSec: tempo,
    tempo_atual: tempo
  };
}

function normalize(parsed: unknown): ShellSnapshot | null {
  if (!parsed || typeof parsed !== "object") return null;
  const raw = parsed as ShellSnapshot;
  return {
    href: typeof raw.href === "string" ? raw.href : undefined,
    localStorage:
      raw.localStorage && typeof raw.localStorage === "object" ? raw.localStorage : undefined,
    music: toMusicSnapshot(raw.music)
  };
}

function legacyFile() {
  return new File(Paths.document, LEGACY_FILE_NAME);
}

async function readLegacyFileSnapshot(): Promise<ShellSnapshot | null> {
  try {
    const file = legacyFile();
    if (!file.exists) return null;
    const parsed = JSON.parse(await file.text()) as unknown;
    const snapshot = normalize(parsed);
    if (snapshot) {
      try {
        file.delete();
      } catch {
        // ignore
      }
    }
    return snapshot;
  } catch {
    return null;
  }
}

export function peekShellSnapshot(): ShellSnapshot {
  return memory;
}

export async function readShellSnapshot(): Promise<ShellSnapshot | null> {
  if (loaded) return memory;

  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const snapshot = normalize(JSON.parse(raw));
      memory = snapshot ?? {};
      loaded = true;
      return snapshot;
    }
  } catch {
    // fallback legado
  }

  const legacy = await readLegacyFileSnapshot();
  memory = legacy ?? {};
  loaded = true;
  if (legacy) {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(legacy)).catch(() => undefined);
  }
  return legacy;
}

async function persistNow() {
  const payload = JSON.stringify(memory);
  writeChain = writeChain
    .then(() => AsyncStorage.setItem(STORAGE_KEY, payload))
    .catch(() => undefined);
  await writeChain;
}

export async function flushShellSnapshot() {
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  if (!loaded) await readShellSnapshot();
  await persistNow();
}

function scheduleWrite() {
  // Throttle, não debounce: atualizações de progresso a cada 500 ms não podem
  // adiar a gravação indefinidamente.
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    void persistNow();
  }, WRITE_DEBOUNCE_MS);
}

export async function writeShellSnapshot(snapshot: ShellSnapshot) {
  memory = {
    href: snapshot.href,
    localStorage: snapshot.localStorage,
    music: toMusicSnapshot(snapshot.music)
  };
  loaded = true;
  scheduleWrite();
}

export async function mergeShellSnapshot(partial: Partial<ShellSnapshot>) {
  if (!loaded) await readShellSnapshot();
  memory = {
    href: partial.href ?? memory.href,
    localStorage: partial.localStorage ?? memory.localStorage,
    music: "music" in partial ? toMusicSnapshot(partial.music) : memory.music
  };
  scheduleWrite();
}

export async function clearShellSnapshot() {
  memory = {};
  loaded = true;
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function musicSnapshotFromPlayback(snap: {
  queue: NativeTrack[];
  index: number;
  playing: boolean;
  positionSec: number;
}): ShellSnapshot["music"] {
  return toMusicSnapshot({
    tracks: snap.queue,
    index: snap.index,
    playing: snap.playing,
    positionSec: snap.positionSec,
    tempo_atual: snap.positionSec
  });
}

/** Script estável: grava localStorage ANTES do React hidratar. */
export function buildStorageBootScript(snapshot: ShellSnapshot | null) {
  const storage = snapshot?.localStorage ?? {};
  return `
    (function () {
      var root = document.documentElement;
      if (root) root.classList.add("is-native-app");
      try {
        var data = ${JSON.stringify(storage)};
        if (data && typeof data === "object") {
          Object.keys(data).forEach(function (key) {
            if (typeof data[key] === "string") {
              localStorage.setItem(key, data[key]);
            }
          });
        }
      } catch (e) {}
      true;
    })();
  `;
}
