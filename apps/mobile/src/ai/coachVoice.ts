import { Audio } from "expo-av";

export async function speakCoach(text: string) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Speech = require("expo-speech") as { speak: (value: string, opts?: object) => void; stop: () => void };
    Speech.stop();
    Speech.speak(text.replace(/\*\*/g, ""), { language: "pt-BR", pitch: 1, rate: 1.02 });
  } catch {
    // TTS indisponível no runtime atual
  }
}

export async function stopCoachVoice() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Speech = require("expo-speech") as { stop: () => void };
    Speech.stop();
  } catch {
    // ignore
  }
}

export async function recordCoachClip(maxMs = 12_000): Promise<string | null> {
  const recording = await startCoachRecording();
  await new Promise((resolve) => setTimeout(resolve, maxMs));
  return stopCoachRecording(recording);
}

export async function startCoachRecording() {
  const permission = await Audio.requestPermissionsAsync();
  if (!permission.granted) throw new Error("Permita o microfone para falar com o Coach.");
  await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
  const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
  return recording;
}

export async function stopCoachRecording(recording: Audio.Recording) {
  try {
    await recording.stopAndUnloadAsync();
  } catch {
    // ignore
  }
  await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
  return recording.getURI();
}