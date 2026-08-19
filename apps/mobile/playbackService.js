/**
 * Headless JS do Track Player: continua vivo com o app minimizado ou morto.
 * Expo Go não registra este arquivo (index.js).
 */
module.exports = async function playbackService() {
  const TrackPlayer = require("react-native-track-player");
  const { Event } = require("react-native-track-player");

  TrackPlayer.addEventListener(Event.RemotePlay, () => {
    void TrackPlayer.play();
  });
  TrackPlayer.addEventListener(Event.RemotePause, () => {
    void TrackPlayer.pause();
  });
  TrackPlayer.addEventListener(Event.RemoteStop, () => {
    void TrackPlayer.stop();
  });
  TrackPlayer.addEventListener(Event.RemoteNext, () => {
    void TrackPlayer.skipToNext();
  });
  TrackPlayer.addEventListener(Event.RemotePrevious, () => {
    void TrackPlayer.skipToPrevious();
  });
  TrackPlayer.addEventListener(Event.RemoteSeek, (event) => {
    if (typeof event?.position === "number") {
      void TrackPlayer.seekTo(event.position);
    }
  });
};
