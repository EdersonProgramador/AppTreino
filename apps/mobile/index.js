import { registerRootComponent } from "expo";
import Constants from "expo-constants";

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
