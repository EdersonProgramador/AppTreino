import { Audio, InterruptionModeAndroid, InterruptionModeIOS, type AVPlaybackStatus } from "expo-av";
import { AppState, type AppStateStatus } from "react-native";
import {
  getTrackPlayerRuntime,
  setupTrackPlayerIfAvailable,
  toTrackPlayerTracks,
  type TrackPlayerRuntime
} from "./trackPlayer";

export type NativeTrack = {
  id: string;
  title: string;
  artist: string;
  artwork?: string;
  url: string;
};

export type RepeatMode = "off" | "one" | "all";

export type MusicPlaybackSnapshot = {
  queue: NativeTrack[];
  index: number;
  playing: boolean;
  loading: boolean;
  error: string | null;
  current: NativeTrack | null;
  positionSec: number;
  durationSec: number;
  ended?: boolean;
  volume: number;
  shuffle: boolean;
  repeat: RepeatMode;
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
    durationSec: 0,
    volume: 1,
    shuffle: false,
    repeat: "off"
  };
}

/**
 * Player persistente em segundo plano.
 * Development/production build: react-native-track-player (foreground service + lock screen).
 * Expo Go: expo-av com staysActiveInBackground (iOS ok; Android Go limita o SO).
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
  private userPaused = false;
  private engine: "pending" | "trackplayer" | "expo-av" = "pending";
  private rntp: TrackPlayerRuntime | null = null;
  private trackEventsBound = false;
  private engineReady: Promise<void>;
  private volume = 1;
  private shuffleOn = false;
  private repeatMode: RepeatMode = "off";

  constructor() {
    this.engineReady = this.resolveEngine();
    AppState.addEventListener("change", (next: AppStateStatus) => {
      void this.handleAppState(next);
    });
  }

  private async resolveEngine() {
    const ok = await setupTrackPlayerIfAvailable();
    if (ok) {
      this.rntp = getTrackPlayerRuntime();
      if (this.rntp) {
        this.engine = "trackplayer";
        this.bindTrackPlayerEvents();
        return;
      }
    }
    this.engine = "expo-av";
    await this.ensureMode().catch(() => undefined);
  }

  private usingTrackPlayer() {
    return this.engine === "trackplayer" && this.rntp != null;
  }

  private intendedPlaying() {
    return this.queue.length > 0 && !this.userPaused;
  }

  private bindTrackPlayerEvents() {
    if (this.trackEventsBound || !this.rntp) return;
    this.trackEventsBound = true;
    const { TrackPlayer, Event, State } = this.rntp;

    TrackPlayer.addEventListener(Event.PlaybackProgressUpdated, (data) => {
      this.positionMillis = Math.max(0, (data.position ?? 0) * 1000);
      this.durationMillis = Math.max(0, (data.duration ?? 0) * 1000);
      this.emit();
    });

    TrackPlayer.addEventListener(Event.PlaybackState, (data) => {
      if (data.state === State.Playing) {
        this.playing = true;
        this.loading = false;
        this.emit();
        return;
      }
      this.loading = data.state === State.Buffering || data.state === State.Loading;
      if ((data.state === State.Paused || data.state === State.Stopped) && this.userPaused) {
        this.playing = false;
        this.emit();
      }
    });

    TrackPlayer.addEventListener(Event.RemotePause, () => {
      this.userPaused = true;
      this.playing = false;
      this.emit();
    });

    TrackPlayer.addEventListener(Event.RemotePlay, () => {
      this.userPaused = false;
      this.playing = true;
      this.emit();
    });

    TrackPlayer.addEventListener(Event.RemoteStop, () => {
      void this.stop();
    });

    TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, (data) => {
      if (typeof data.index === "number" && data.index >= 0) {
        this.index = data.index;
        this.emit();
      }
    });

    TrackPlayer.addEventListener(Event.PlaybackQueueEnded, () => {
      void this.handleEnded();
    });
  }

  private async resumeIfIntended() {
    if (!this.intendedPlaying()) return;
    this.playing = true;

    if (this.usingTrackPlayer() && this.rntp) {
      try {
        await this.rntp.TrackPlayer.play();
        this.playing = true;
        this.emit();
      } catch {
        // serviço nativo ainda vivo; ignora
      }
      return;
    }

    if (this.sound) {
      try {
        const status = await this.sound.getStatusAsync();
        if (status.isLoaded) {
          if (!status.isPlaying) await this.sound.playAsync();
          this.playing = true;
          this.emit();
          return;
        }
      } catch {
        // recarrega só se o Sound morreu
      }
    }

    await this.loadCurrent({ autoplay: true, resumeSec: this.positionMillis / 1000 });
  }

  private async handleAppState(next: AppStateStatus) {
    const background = next === "background" || next === "inactive";

    if (background) {
      return;
    }

    if (next !== "active") return;

    if (this.usingTrackPlayer() && this.rntp) {
      try {
        const progress = await this.rntp.TrackPlayer.getProgress();
        this.positionMillis = Math.max(0, (progress.position ?? 0) * 1000);
        this.durationMillis = Math.max(0, (progress.duration ?? 0) * 1000);
        const index = await this.rntp.TrackPlayer.getActiveTrackIndex();
        if (typeof index === "number" && index >= 0) this.index = index;
        const state = await this.rntp.TrackPlayer.getPlaybackState();
        this.playing = state.state === this.rntp.State.Playing || this.intendedPlaying();
        if (this.intendedPlaying() && state.state !== this.rntp.State.Playing) {
          await this.rntp.TrackPlayer.play();
          this.playing = true;
        }
        this.emit();
      } catch {
        // ignore
      }
      return;
    }

    if (!this.intendedPlaying()) return;
    await this.resumeIfIntended();
  }

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
      playing: this.queue.length > 0 && !this.userPaused,
      loading: this.loading,
      error: this.error,
      current: this.queue[this.index] ?? null,
      positionSec: this.positionMillis / 1000,
      durationSec: this.durationMillis / 1000,
      volume: this.volume,
      shuffle: this.shuffleOn,
      repeat: this.repeatMode
    };
  }

  private emit(override?: Partial<MusicPlaybackSnapshot>) {
    const snap = { ...this.snapshot(), ...override };
    this.listeners.forEach((listener) => listener(snap));
  }

  private async ensureMode() {
    if (this.modeReady) return;
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      staysActiveInBackground: true,
      playsInSilentModeIOS: true,
      interruptionModeIOS: InterruptionModeIOS.MixWithOthers,
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
    this.loading = false;
    this.positionMillis = status.positionMillis ?? 0;
    this.durationMillis = status.durationMillis ?? 0;
    if (status.didJustFinish) {
      void this.handleEnded();
      return;
    }

    if (!status.isPlaying && this.intendedPlaying()) {
      return;
    }

    this.playing = status.isPlaying;
    this.emit();
  };

  async openQueue(
    tracks: NativeTrack[],
    startIndex = 0,
    options?: { autoplay?: boolean; resumeSec?: number }
  ) {
    if (!tracks.length) return;
    this.loadChain = this.loadChain
      .then(async () => {
        await this.engineReady;
        await this.openQueueExclusive(tracks, startIndex, options);
      })
      .catch(() => undefined);
    await this.loadChain;
  }

  private sameQueue(tracks: NativeTrack[]) {
    return (
      this.queue.length === tracks.length &&
      this.queue.every((track, i) => track.id === tracks[i]?.id)
    );
  }

  private async openQueueExclusive(
    tracks: NativeTrack[],
    startIndex = 0,
    options?: { autoplay?: boolean; resumeSec?: number }
  ) {
    const safeIndex = Math.min(Math.max(0, startIndex), tracks.length - 1);
    const autoplay = options?.autoplay !== false;
    const resumeSec = options?.resumeSec;

    if (this.usingTrackPlayer() && this.rntp) {
      this.error = null;
      if (this.sameQueue(tracks)) {
        if (this.index !== safeIndex) {
          this.index = safeIndex;
          try {
            await this.rntp.TrackPlayer.skip(safeIndex);
          } catch {
            // ignore
          }
        }
        if (typeof resumeSec === "number" && resumeSec > 0.4) {
          try {
            const progress = await this.rntp.TrackPlayer.getProgress();
            if (Math.abs((progress.position ?? 0) - resumeSec) > 1.5) {
              await this.rntp.TrackPlayer.seekTo(resumeSec);
            }
          } catch {
            // ignore
          }
        }
        if (autoplay) {
          this.userPaused = false;
          await this.play();
        }
        this.emit();
        return;
      }

      this.userPaused = !autoplay;
      this.queue = tracks;
      this.index = safeIndex;
      this.emit();
      await this.rntp.TrackPlayer.reset();
      await this.rntp.TrackPlayer.add(toTrackPlayerTracks(tracks));
      if (safeIndex > 0) await this.rntp.TrackPlayer.skip(safeIndex);
      if (typeof resumeSec === "number" && resumeSec > 0.4) {
        await this.rntp.TrackPlayer.seekTo(resumeSec);
        this.positionMillis = resumeSec * 1000;
      }
      if (autoplay) {
        await this.rntp.TrackPlayer.play();
        this.playing = true;
        this.userPaused = false;
      } else {
        this.playing = false;
      }
      this.emit();
      return;
    }

    await this.ensureMode();
    if (this.sameQueue(tracks) && this.sound) {
      this.error = null;
      if (this.index !== safeIndex) {
        this.index = safeIndex;
        await this.loadCurrent({ autoplay, resumeSec });
        return;
      }
      if (typeof resumeSec === "number" && resumeSec > 0.4) {
        try {
          const status = await this.sound.getStatusAsync();
          if (status.isLoaded) {
            const currentSec = (status.positionMillis ?? 0) / 1000;
            if (Math.abs(currentSec - resumeSec) > 1.5) {
              await this.sound.setPositionAsync(resumeSec * 1000);
            }
          }
        } catch {
          // ignore
        }
      }
      this.emit();
      if (autoplay && !this.userPaused && !this.playing) {
        await this.play();
      }
      return;
    }

    this.userPaused = !autoplay;
    this.queue = tracks;
    this.index = safeIndex;
    this.error = null;
    this.emit();
    await this.loadCurrent({ autoplay, resumeSec });
  }

  private async loadCurrent({ autoplay, resumeSec }: { autoplay: boolean; resumeSec?: number }) {
    if (this.usingTrackPlayer() && this.rntp) {
      try {
        await this.rntp.TrackPlayer.skip(this.index);
        if (typeof resumeSec === "number" && resumeSec > 0.4) {
          await this.rntp.TrackPlayer.seekTo(resumeSec);
        }
        if (autoplay) {
          this.userPaused = false;
          await this.rntp.TrackPlayer.play();
          this.playing = true;
        }
        this.emit();
      } catch {
        this.error = "Nao foi possivel reproduzir esta faixa.";
        this.playing = false;
        this.emit();
      }
      return;
    }

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
      const positionMillis =
        typeof resumeSec === "number" && resumeSec > 0.4 ? Math.round(resumeSec * 1000) : 0;
      const { sound } = await Audio.Sound.createAsync(
        { uri: track.url },
        {
          shouldPlay: autoplay,
          progressUpdateIntervalMillis: 500,
          positionMillis,
          isLooping: false
        },
        this.onStatus
      );
      if (token !== this.loadToken) {
        await sound.unloadAsync();
        return;
      }
      this.sound = sound;
      this.playing = autoplay;
      this.loading = false;
      this.userPaused = !autoplay;
      if (positionMillis > 0) this.positionMillis = positionMillis;
      await this.applyVolume();
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
    if (this.playing) {
      await this.pause();
      return;
    }
    await this.play();
  }

  async play() {
    await this.engineReady;
    this.userPaused = false;
    if (this.usingTrackPlayer() && this.rntp) {
      await this.rntp.TrackPlayer.play();
      this.playing = true;
      this.emit();
      return;
    }
    if (!this.sound) {
      await this.loadCurrent({ autoplay: true });
      return;
    }
    await this.sound.playAsync();
    this.playing = true;
    this.emit();
  }

  async pause() {
    this.userPaused = true;
    this.playing = false;
    if (this.usingTrackPlayer() && this.rntp) {
      try {
        await this.rntp.TrackPlayer.pause();
      } catch {
        // ignore
      }
      this.emit();
      return;
    }
    if (!this.sound) {
      this.emit();
      return;
    }
    await this.sound.pauseAsync();
    this.emit();
  }

  async next(options: { autoplay?: boolean } = {}) {
    if (!this.queue.length) return;
    this.index = (this.index + 1) % this.queue.length;
    this.emit();
    const autoplay = options.autoplay ?? !this.userPaused;
    if (this.usingTrackPlayer() && this.rntp) {
      try {
        await this.rntp.TrackPlayer.skip(this.index);
        if (autoplay) {
          this.userPaused = false;
          await this.rntp.TrackPlayer.play();
          this.playing = true;
        }
        this.emit();
      } catch {
        await this.loadCurrent({ autoplay });
      }
      return;
    }
    await this.loadCurrent({ autoplay });
  }

  async prev() {
    if (!this.queue.length) return;
    const autoplay = !this.userPaused;
    const positionSec = this.positionMillis / 1000;
    if (positionSec > 3) {
      await this.seekRatio(0);
      return;
    }
    this.index = (this.index - 1 + this.queue.length) % this.queue.length;
    this.emit();
    if (this.usingTrackPlayer() && this.rntp) {
      try {
        await this.rntp.TrackPlayer.skip(this.index);
        if (autoplay) await this.rntp.TrackPlayer.play();
        this.emit();
      } catch {
        await this.loadCurrent({ autoplay });
      }
      return;
    }
    await this.loadCurrent({ autoplay });
  }

  async playAt(index: number) {
    if (!this.queue[index]) return;
    const autoplay = !this.userPaused;
    this.index = index;
    this.emit();
    await this.loadCurrent({ autoplay });
  }

  async seekRatio(ratio: number) {
    const next = Math.min(1, Math.max(0, ratio));
    if (this.usingTrackPlayer() && this.rntp) {
      try {
        const progress = await this.rntp.TrackPlayer.getProgress();
        const duration = progress.duration ?? this.durationMillis / 1000;
        if (duration > 0) await this.rntp.TrackPlayer.seekTo(duration * next);
        this.emit();
      } catch {
        // ignore
      }
      return;
    }
    if (!this.sound) return;
    const status = await this.sound.getStatusAsync();
    if (!status.isLoaded || !status.durationMillis) return;
    await this.sound.setPositionAsync(status.durationMillis * next);
    this.emit();
  }

  /** Encerra o Play de verdade (para o áudio e limpa a fila). */
  async stop() {
    this.loadToken += 1;
    this.userPaused = true;
    this.playing = false;
    if (this.usingTrackPlayer() && this.rntp) {
      try {
        await this.rntp.TrackPlayer.reset();
      } catch {
        // ignore
      }
    }
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

  async setVolume(value: number) {
    this.volume = Math.min(1, Math.max(0, value));
    await this.applyVolume();
    this.emit();
  }

  async cycleRepeat() {
    this.repeatMode = this.repeatMode === "off" ? "all" : this.repeatMode === "all" ? "one" : "off";
    this.emit();
  }

  async setShuffle(on: boolean) {
    this.shuffleOn = on;
    if (this.queue.length > 1) {
      const current = this.queue[this.index];
      const rest = this.queue.filter((_, index) => index !== this.index);
      const ordered = on ? [...rest].sort(() => Math.random() - 0.5) : rest;
      this.queue = current ? [current, ...ordered] : ordered;
      this.index = 0;
      if (this.usingTrackPlayer() && this.rntp) {
        try {
          await this.rntp.TrackPlayer.reset();
          await this.rntp.TrackPlayer.add(toTrackPlayerTracks(this.queue));
          await this.rntp.TrackPlayer.skip(0);
        } catch {
          // ignore
        }
      }
    }
    this.emit();
  }

  private async applyVolume() {
    try {
      await this.sound?.setVolumeAsync(this.volume);
    } catch {
      // ignore
    }
    if (this.usingTrackPlayer() && this.rntp) {
      try {
        await this.rntp.TrackPlayer.setVolume(this.volume);
      } catch {
        // ignore
      }
    }
  }

  private async handleEnded() {
    if (this.repeatMode === "one") {
      this.userPaused = false;
      await this.seekRatio(0);
      await this.play();
      return;
    }
    const last = this.index >= this.queue.length - 1;
    if (this.repeatMode === "all" || !last) {
      await this.next({ autoplay: true });
      return;
    }
    this.playing = false;
    this.userPaused = true;
    this.emit({ ended: true, playing: false });
  }

  hasQueue() {
    return this.queue.length > 0;
  }
}

export const musicPlayback = new MusicPlaybackService();
export const emptyMusicSnapshot = emptySnapshot;
