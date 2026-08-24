/**
 * Music player: collapse / complete workout must not stop audio.
 * Run with: npx tsx --test src/stores/musicPlayerStore.test.ts
 */
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

const memory = new Map<string, string>();

(globalThis as { window?: unknown }).window = {
  localStorage: {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, value);
    },
    removeItem: (key: string) => {
      memory.delete(key);
    }
  }
};

const { useMusicPlayerStore } = await import("./musicPlayerStore.ts");

const sampleTrack = {
  id: "t1",
  title: "Faixa E2E",
  artist: "App Treino",
  audioUrl: "https://example.com/track.mp3",
  coverUrl: null,
  durationSec: 120
};

describe("musicPlayerStore keep-playing", () => {
  beforeEach(() => {
    memory.clear();
    useMusicPlayerStore.setState({
      sourceQueue: [sampleTrack],
      queue: [sampleTrack],
      index: 0,
      playing: true,
      progress: 42,
      duration: 120,
      expanded: true,
      queueOpen: true,
      seekRatio: null
    });
  });

  it("collapse only hides the overlay and keeps playback", () => {
    useMusicPlayerStore.getState().collapse();
    const state = useMusicPlayerStore.getState();
    assert.equal(state.expanded, false);
    assert.equal(state.queueOpen, false);
    assert.equal(state.playing, true);
    assert.equal(state.queue.length, 1);
    assert.equal(state.progress, 42);
  });

  it("reset is the only action that clears the queue", () => {
    useMusicPlayerStore.getState().collapse();
    assert.equal(useMusicPlayerStore.getState().playing, true);
    useMusicPlayerStore.getState().reset();
    const state = useMusicPlayerStore.getState();
    assert.equal(state.playing, false);
    assert.equal(state.queue.length, 0);
  });

  it("hideMiniDock dismisses the bar without stopping playback", () => {
    useMusicPlayerStore.setState({ expanded: false, miniHidden: false, playing: true });
    useMusicPlayerStore.getState().hideMiniDock();
    const state = useMusicPlayerStore.getState();
    assert.equal(state.miniHidden, true);
    assert.equal(state.playing, true);
    assert.equal(state.queue.length, 1);
    assert.equal(state.progress, 42);
  });
});
