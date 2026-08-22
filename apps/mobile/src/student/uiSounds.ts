import AsyncStorage from "@react-native-async-storage/async-storage";
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from "expo-av";

const SOUND_KEY = "app-treino-sound-enabled";
const CDN = "https://reactsounds.sfo3.cdn.digitaloceanspaces.com/v1";

/** Mesmos arquivos hashed do react-sounds 1.0.30 usados no WebView. */
const FILES: Record<string, string> = {
  "game/void": "game/void.ab99118.mp3",
  "notification/error": "notification/error.b92d3c6.mp3",
  "notification/popup": "notification/popup.cf74b54.mp3",
  "notification/success": "notification/success.f38c2ed.mp3",
  "notification/warning": "notification/warning.207aed9.mp3",
  "notification/info": "notification/info.fc3baa4.mp3",
  "system/boot_up": "system/boot_up.7369806.mp3",
  "system/device_connect": "system/device_connect.e609d62.mp3",
  "system/device_disconnect": "system/device_disconnect.bd814fa.mp3",
  "system/screenshot": "system/screenshot.f3483cb.mp3",
  "system/trash": "system/trash.ed51a4e.mp3",
  "ui/blocked": "ui/blocked.be40409.mp3",
  "ui/button_soft": "ui/button_soft.896771c.mp3",
  "ui/item_select": "ui/item_select.5d88832.mp3",
  "ui/item_deselect": "ui/item_deselect.9955ec7.mp3",
  "ui/keystroke_soft": "ui/keystroke_soft.fcd4503.mp3",
  "ui/popup_close": "ui/popup_close.1bd2a1b.mp3",
  "ui/popup_open": "ui/popup_open.97597a8.mp3",
  "ui/radio_select": "ui/radio_select.4fbe4e3.mp3",
  "ui/submit": "ui/submit.1e228b1.mp3",
  "ui/success_chime": "ui/success_chime.436ed4a.mp3",
  "ui/toggle_on": "ui/toggle_on.2f87bf7.mp3",
  "ui/toggle_off": "ui/toggle_off.7103845.mp3"
};

const cache = new Map<string, Audio.Sound>();
const listeners = new Set<(enabled: boolean) => void>();
let enabled = true;
let hydrated = false;
let hydratePromise: Promise<void> | null = null;
let audioReady = false;

async function ensureUiAudioMode() {
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      interruptionModeIOS: InterruptionModeIOS.MixWithOthers,
      interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false
    });
    audioReady = true;
  } catch {
    audioReady = false;
  }
}

function notify() {
  for (const listener of listeners) listener(enabled);
}

export function subscribeSoundEnabled(listener: (enabled: boolean) => void) {
  listeners.add(listener);
  listener(enabled);
  return () => {
    listeners.delete(listener);
  };
}

export function isSoundEnabled() {
  return enabled;
}

export async function hydrateUiSounds() {
  if (hydrated) return;
  if (!hydratePromise) {
    hydratePromise = (async () => {
      try {
        const saved = await AsyncStorage.getItem(SOUND_KEY);
        if (hydrated) return;
        if (saved === "0" || saved === "false") enabled = false;
        else enabled = true;
      } catch {
        if (!hydrated) enabled = true;
      } finally {
        hydrated = true;
        notify();
        await ensureUiAudioMode();
      }
    })();
  }
  await hydratePromise;
}

export function setSoundEnabled(next: boolean) {
  enabled = next;
  hydrated = true;
  notify();
  void AsyncStorage.setItem(SOUND_KEY, next ? "1" : "0").catch(() => {
    // Preferência já está aplicada na sessão.
  });
  if (next) void ensureUiAudioMode();
}

export function unlockUiAudio() {
  void ensureUiAudioMode();
}

async function playLibrarySound(name: string, volume = 0.45) {
  if (!enabled) return;
  const file = FILES[name];
  if (!file) return;
  try {
    if (!audioReady) await ensureUiAudioMode();
    let sound = cache.get(name);
    if (!sound) {
      const created = await Audio.Sound.createAsync(
        { uri: `${CDN}/${file}` },
        { shouldPlay: false, volume, isLooping: false }
      );
      sound = created.sound;
      cache.set(name, sound);
    }
    await sound.setVolumeAsync(volume);
    await sound.setPositionAsync(0);
    const status = await sound.playAsync();
    if (!status.isLoaded) throw new Error("play failed");
  } catch {
    audioReady = false;
    cache.delete(name);
    try {
      await ensureUiAudioMode();
      const created = await Audio.Sound.createAsync(
        { uri: `${CDN}/${file}` },
        { shouldPlay: true, volume, isLooping: false }
      );
      cache.set(name, created.sound);
    } catch {
      // Sem rede/CDN — a UI segue sem áudio, igual ao WebView.
    }
  }
}

export function preloadUiSounds() {
  void (async () => {
    await hydrateUiSounds();
    if (!enabled) return;
    await Promise.all(
      Object.entries(FILES).map(async ([name, file]) => {
        if (cache.has(name)) return;
        try {
          const created = await Audio.Sound.createAsync(
            { uri: `${CDN}/${file}` },
            { shouldPlay: false, volume: 0.45, isLooping: false }
          );
          cache.set(name, created.sound);
        } catch {
          // ignore
        }
      })
    );
  })();
}

export const uiSounds = {
  void: () => void playLibrarySound("game/void"),
  error: () => void playLibrarySound("notification/error"),
  popupNotify: () => void playLibrarySound("notification/popup"),
  success: () => void playLibrarySound("notification/success"),
  bootUp: () => void playLibrarySound("system/boot_up"),
  paymentApproved: () => void playLibrarySound("system/device_connect"),
  paymentDisconnected: () => void playLibrarySound("system/device_disconnect"),
  disconnect: () => void playLibrarySound("system/device_disconnect"),
  screenshot: () => void playLibrarySound("system/screenshot"),
  trash: () => void playLibrarySound("system/trash"),
  blocked: () => void playLibrarySound("ui/blocked"),
  warning: () => void playLibrarySound("notification/warning"),
  info: () => void playLibrarySound("notification/info"),
  pageChange: () => void playLibrarySound("ui/button_soft"),
  studentPage: () => void playLibrarySound("ui/keystroke_soft"),
  itemSelect: () => void playLibrarySound("ui/item_select"),
  itemDeselect: () => void playLibrarySound("ui/item_deselect"),
  popupOpen: () => void playLibrarySound("ui/popup_open"),
  popupClose: () => void playLibrarySound("ui/popup_close"),
  radioSelect: () => void playLibrarySound("ui/radio_select"),
  submit: () => void playLibrarySound("ui/submit"),
  workoutComplete: () => void playLibrarySound("ui/success_chime"),
  toggleOn: () => void playLibrarySound("ui/toggle_on"),
  toggleOff: () => void playLibrarySound("ui/toggle_off"),
  click: () => void playLibrarySound("ui/button_soft"),
  nav: () => void playLibrarySound("ui/keystroke_soft"),
  open: () => void playLibrarySound("ui/popup_open"),
  close: () => void playLibrarySound("ui/popup_close"),
  complete: () => void playLibrarySound("ui/success_chime"),
  musicSeekStart: () => void playLibrarySound("ui/keystroke_soft", 0.22),
  musicSeekTick: () => void playLibrarySound("ui/item_select", 0.16),
  musicSeekCommit: () => void playLibrarySound("ui/radio_select", 0.28)
} as const;
