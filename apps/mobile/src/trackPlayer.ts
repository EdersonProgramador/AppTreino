import type { NativeTrack } from "./musicPlayback";

/**
 * react-native-track-player integration point.
 *
 * Expo Go cannot load custom native modules. Playback in Expo Go uses expo-av
 * (`musicPlayback`). After `npx expo prebuild` / EAS development build,
 * swap the player implementation to TrackPlayer via these helpers.
 */

export async function setupTrackPlayerIfAvailable(): Promise<boolean> {
  try {
    const TrackPlayer = (await import("react-native-track-player")).default;
    const { Capability } = await import("react-native-track-player");
    await TrackPlayer.setupPlayer();
    await TrackPlayer.updateOptions({
      capabilities: [Capability.Play, Capability.Pause, Capability.SkipToNext, Capability.SkipToPrevious, Capability.Stop]
    });
    return true;
  } catch {
    return false;
  }
}

export async function playQueueWithTrackPlayer(tracks: NativeTrack[], startIndex = 0) {
  const TrackPlayer = (await import("react-native-track-player")).default;
  await TrackPlayer.reset();
  await TrackPlayer.add(
    tracks.map((track) => ({
      id: track.id,
      url: track.url,
      title: track.title,
      artist: track.artist,
      artwork: track.artwork
    }))
  );
  if (startIndex > 0) {
    await TrackPlayer.skip(startIndex);
  }
  await TrackPlayer.play();
}
