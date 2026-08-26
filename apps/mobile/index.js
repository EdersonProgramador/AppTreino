// MUST be first (no ESM imports above this — Metro hoists them).
// Hermes TextDecoder lacks utf-16le; h3-js crashes without this polyfill.
require("./src/polyfills/textEncoding");
require("react-native-gesture-handler");

const { registerRootComponent } = require("expo");
const Constants = require("expo-constants").default;

// Task GPS em background (TaskManager) — registrar antes do App montar.
require("./src/tracking/location/trackingLocationTask");

// Headless service ANTES de importar o App (setupPlayer roda no construtor de musicPlayback).
if (Constants.appOwnership !== "expo") {
  try {
    const TrackPlayer = require("react-native-track-player");
    TrackPlayer.registerPlaybackService(() => require("./playbackService"));
  } catch {
    // playback continua no expo-av
  }
}

const App = require("./App").default;

registerRootComponent(App);
