import { Audio, InterruptionModeAndroid, InterruptionModeIOS, type AVPlaybackStatus } from "expo-av";

export type NativeTrack = {
  id: string;
  title: string;
  artist: string;
  artwork?: string;
  url: string;
};

export type MusicPlaybackSnapshot = {
  queue: NativeTrack[];
  index: number;
  playing: boolean;
  loading: boolean;
  error: string | null;
  current: NativeTrack | null;
  positionSec: number;
  durationSec: number;
};

type Listener = (snapshot: MusicPlaybackSnapshot) => void;

function emptySnapshot(): MusicPlaybackSnapshot {
  return {
    queue: [],
    index: 0,
    playing: false,
    loading: false,
    error: null,
    current: null,
    positionSec: 0,
    durationSec: 0
  };
}

/**
 * Player nativo persistente (expo-av).
 * Continua tocando com a UI fechada / WebView em uso.
 * Só para ao chamar stop() (encerrar Play de verdade).
 */
class MusicPlaybackService {
  private queue: NativeTrack[] = [];
  private index = 0;
  private playing = false;
  private loading = false;
  private error: string | null = null;
  private sound: Audio.Sound | null = null;
  private modeReady = false;
  private listeners = new Set<Listener>();
  private loadToken = 0;
  private positionMillis = 0;
  private durationMillis = 0;
  private loadChain: Promise<void> = Promise.resolve();

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  snapshot(): MusicPlaybackSnapshot {
    return {
      queue: this.queue,
      index: this.index,
      playing: this.playing,
      loading: this.loading,
      error: this.error,
      current: this.queue[this.index] ?? null,
      positionSec: this.positionMillis / 1000,
      durationSec: this.durationMillis / 1000
    };
  }

  private emit() {
    const snap = this.snapshot();
    this.listeners.forEach((listener) => listener(snap));
  }

  private async ensureMode() {
    if (this.modeReady) return;
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      staysActiveInBackground: true,
      playsInSilentModeIOS: true,
      interruptionModeIOS: InterruptionModeIOS.DuckOthers,
      interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false
    });
    this.modeReady = true;
  }

  private async unloadSound() {
    const current = this.sound;
    this.sound = null;
    if (!current) return;
    try {
      await current.stopAsync();
    } catch {
      // ignore
    }
    try {
      await current.unloadAsync();
    } catch {
      // ignore
    }
  }

  private onStatus = (status: AVPlaybackStatus) => {
    if (!status.isLoaded) {
      if (status.error) {
        this.error = "Nao foi possivel reproduzir esta faixa.";
        this.playing = false;
        this.loading = false;
        this.emit();
      }
      return;
    }
    this.playing = status.isPlaying;
    this.loading = false;
    this.positionMillis = status.positionMillis ?? 0;
    this.durationMillis = status.durationMillis ?? 0;
    if (status.didJustFinish) {
      void this.next({ autoplay: true });
      return;
    }
    this.emit();
  };

  async openQueue(tracks: NativeTrack[], startIndex = 0) {
    if (!tracks.length) return;
    // Serializa aberturas (evita 2 Sound tocando se a mensagem vier duplicada).
    this.loadChain = this.loadChain.then(() => this.openQueueExclusive(tracks, startIndex)).catch(() => undefined);
    await this.loadChain;
  }

  private async openQueueExclusive(tracks: NativeTrack[], startIndex = 0) {
    await this.ensureMode();
    const safeIndex = Math.min(Math.max(0, startIndex), tracks.length - 1);
    const sameQueue =
      this.queue.length === tracks.length &&
      this.queue.every((track, i) => track.id === tracks[i]?.id && track.url === tracks[i]?.url);

    if (sameQueue && this.index === safeIndex && this.sound) {
      this.error = null;
      this.emit();
      if (!this.playing) {
        await this.play();
      }
      return;
    }

    this.queue = tracks;
    this.index = safeIndex;
    this.error = null;
    this.emit();
    await this.loadCurrent({ autoplay: true });
  }

  private async loadCurrent({ autoplay }: { autoplay: boolean }) {
    const track = this.queue[this.index];
    if (!track?.url) {
      this.error = "Faixa sem URL de audio.";
      this.playing = false;
      this.loading = false;
      this.emit();
      return;
    }

    const token = ++this.loadToken;
    this.loading = true;
    this.error = null;
    this.emit();

    await this.unloadSound();
    if (token !== this.loadToken) return;

    try {
      const { sound } = await Audio.Sound.createAsync(
        { uri: track.url },
        { shouldPlay: autoplay, progressUpdateIntervalMillis: 500 },
        this.onStatus
      );
      if (token !== this.loadToken) {
        await sound.unloadAsync();
        return;
      }
      this.sound = sound;
      this.playing = autoplay;
      this.loading = false;
      this.emit();
    } catch {
      if (token !== this.loadToken) return;
      this.sound = null;
      this.playing = false;
      this.loading = false;
      this.error = "Nao foi possivel reproduzir esta faixa.";
      this.emit();
    }
  }

  async toggle() {
    if (!this.sound) {
      await this.loadCurrent({ autoplay: true });
      return;
    }
    const status = await this.sound.getStatusAsync();
    if (!status.isLoaded) return;
    if (status.isPlaying) {
      await this.sound.pauseAsync();
      this.playing = false;
    } else {
      await this.sound.playAsync();
      this.playing = true;
    }
    this.emit();
  }

  async play() {
    if (!this.sound) {
      await this.loadCurrent({ autoplay: true });
      return;
    }
    await this.sound.playAsync();
    this.playing = true;
    this.emit();
  }

  async pause() {
    if (!this.sound) return;
    await this.sound.pauseAsync();
    this.playing = false;
    this.emit();
  }

  async next(options: { autoplay?: boolean } = {}) {
    if (!this.queue.length) return;
    this.index = (this.index + 1) % this.queue.length;
    this.emit();
    await this.loadCurrent({ autoplay: options.autoplay ?? this.playing });
  }

  async prev() {
    if (!this.queue.length) return;
    if (this.sound) {
      const status = await this.sound.getStatusAsync();
      if (status.isLoaded && status.positionMillis > 3000) {
        await this.sound.setPositionAsync(0);
        this.emit();
        return;
      }
    }
    this.index = (this.index - 1 + this.queue.length) % this.queue.length;
    this.emit();
    await this.loadCurrent({ autoplay: true });
  }

  async playAt(index: number) {
    if (!this.queue[index]) return;
    this.index = index;
    this.emit();
    await this.loadCurrent({ autoplay: true });
  }

  async seekRatio(ratio: number) {
    if (!this.sound) return;
    const status = await this.sound.getStatusAsync();
    if (!status.isLoaded || !status.durationMillis) return;
    const next = Math.min(1, Math.max(0, ratio));
    await this.sound.setPositionAsync(status.durationMillis * next);
    this.emit();
  }

  /** Encerra o Play de verdade (para o áudio e limpa a fila). */
  async stop() {
    this.loadToken += 1;
    await this.unloadSound();
    this.queue = [];
    this.index = 0;
    this.playing = false;
    this.loading = false;
    this.error = null;
    this.positionMillis = 0;
    this.durationMillis = 0;
    this.emit();
  }

  hasQueue() {
    return this.queue.length > 0;
  }
}

export const musicPlayback = new MusicPlaybackService();
export const emptyMusicSnapshot = emptySnapshot;
