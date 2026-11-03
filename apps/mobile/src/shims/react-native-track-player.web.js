/** Web preview stub — áudio usa expo-av; Track Player só em build nativo. */
const noop = () => {};
const noopAsync = async () => {};

const TrackPlayer = {
  setupPlayer: noopAsync,
  registerPlaybackService: noop,
  addEventListener: noop,
  play: noopAsync,
  pause: noopAsync,
  skipToNext: noopAsync,
  skipToPrevious: noopAsync,
  seekTo: noopAsync,
  reset: noopAsync,
  add: noopAsync,
  remove: noopAsync,
  getQueue: async () => [],
  getActiveTrackIndex: async () => undefined,
  getProgress: async () => ({ position: 0, duration: 0 }),
  getPlaybackState: async () => ({ state: "none" }),
  setVolume: noopAsync,
  setRepeatMode: noopAsync,
  updateOptions: noopAsync
};

module.exports = {
  ...TrackPlayer,
  default: TrackPlayer,
  Capability: {},
  Event: {
    RemotePlay: "remote-play",
    RemotePause: "remote-pause",
    RemoteStop: "remote-stop",
    RemoteNext: "remote-next",
    RemotePrevious: "remote-previous",
    RemoteSeek: "remote-seek"
  },
  State: { None: "none", Playing: "playing", Paused: "paused" },
  RepeatMode: { Off: "off", Track: "track", Queue: "queue" },
  AppKilledPlaybackBehavior: { ContinuePlayback: "continue-playback" }
};
