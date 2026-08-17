import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from "expo-av";

export type NativeTrack = {
  id: string;
  title: string;
  artist: string;
  artwork?: string;
  url: string;
};

type Props = {
  tracks: NativeTrack[];
  startIndex?: number;
  onClose: () => void;
};

/**
 * Native music player shell.
 * Uses expo-av inside Expo Go; the same queue contract is ready for
 * react-native-track-player once a development build is available.
 */
export function MusicPlayerScreen({ tracks, startIndex = 0, onClose }: Props) {
  const [index, setIndex] = useState(Math.min(Math.max(startIndex, 0), Math.max(tracks.length - 1, 0)));
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const current = tracks[index];

  const subtitle = useMemo(() => {
    if (!tracks.length) return "";
    return `${index + 1} / ${tracks.length}`;
  }, [index, tracks.length]);

  useEffect(() => {
    void Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      staysActiveInBackground: true,
      playsInSilentModeIOS: true,
      interruptionModeIOS: InterruptionModeIOS.DuckOthers,
      interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false
    });
  }, []);

  useEffect(() => {
    let mounted = true;
    let active: Audio.Sound | null = null;

    async function load() {
      if (!current) return;
      setLoading(true);
      setError(null);
      try {
        if (sound) {
          await sound.unloadAsync();
        }
        const { sound: next } = await Audio.Sound.createAsync(
          { uri: current.url },
          { shouldPlay: true },
          (status) => {
            if (!status.isLoaded) return;
            if (status.didJustFinish) {
              setIndex((value) => (value + 1) % tracks.length);
            }
          }
        );
        active = next;
        if (!mounted) {
          await next.unloadAsync();
          return;
        }
        setSound(next);
        setPlaying(true);
      } catch {
        if (mounted) setError("Nao foi possivel reproduzir esta faixa.");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void load();

    return () => {
      mounted = false;
      void active?.unloadAsync();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when track changes
  }, [current?.id, current?.url]);

  useEffect(() => {
    return () => {
      void sound?.unloadAsync();
    };
  }, [sound]);

  async function togglePlay() {
    if (!sound) return;
    const status = await sound.getStatusAsync();
    if (!status.isLoaded) return;
    if (status.isPlaying) {
      await sound.pauseAsync();
      setPlaying(false);
    } else {
      await sound.playAsync();
      setPlaying(true);
    }
  }

  if (!current) {
    return (
      <View style={styles.safe}>
        <Text style={styles.error}>Nenhuma faixa na fila.</Text>
        <Pressable onPress={onClose} style={styles.closeBtn}>
          <Text style={styles.closeText}>Voltar</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.safe}>
      <Pressable onPress={onClose} style={styles.back}>
        <Text style={styles.backText}>Fechar player</Text>
      </Pressable>

      {current.artwork ? (
        <Image source={{ uri: current.artwork }} style={styles.artwork} />
      ) : (
        <View style={[styles.artwork, styles.artworkFallback]} />
      )}

      <Text style={styles.title}>{current.title}</Text>
      <Text style={styles.artist}>{current.artist}</Text>
      <Text style={styles.meta}>{subtitle}</Text>

      {loading && <ActivityIndicator color="#f2b461" style={{ marginTop: 18 }} />}
      {error && <Text style={styles.error}>{error}</Text>}

      <View style={styles.controls}>
        <Pressable onPress={() => setIndex((value) => (value - 1 + tracks.length) % tracks.length)} style={styles.ctrl}>
          <Text style={styles.ctrlText}>Prev</Text>
        </Pressable>
        <Pressable onPress={() => void togglePlay()} style={[styles.ctrl, styles.ctrlPrimary]}>
          <Text style={styles.ctrlPrimaryText}>{playing ? "Pause" : "Play"}</Text>
        </Pressable>
        <Pressable onPress={() => setIndex((value) => (value + 1) % tracks.length)} style={styles.ctrl}>
          <Text style={styles.ctrlText}>Next</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#08090b",
    paddingHorizontal: 24,
    paddingTop: 18,
    paddingBottom: 32
  },
  back: {
    alignSelf: "flex-start",
    marginBottom: 18
  },
  backText: {
    color: "#f2b461",
    fontWeight: "800"
  },
  artwork: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 18,
    marginBottom: 22
  },
  artworkFallback: {
    backgroundColor: "#1b1713"
  },
  title: {
    color: "#fff7ec",
    fontSize: 28,
    fontWeight: "900"
  },
  artist: {
    marginTop: 6,
    color: "rgba(255,247,236,0.7)",
    fontSize: 16,
    fontWeight: "600"
  },
  meta: {
    marginTop: 8,
    color: "#f2b461",
    fontWeight: "700"
  },
  controls: {
    marginTop: "auto",
    flexDirection: "row",
    justifyContent: "center",
    gap: 12
  },
  ctrl: {
    minWidth: 72,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(242,180,97,0.35)"
  },
  ctrlPrimary: {
    backgroundColor: "#f2b461",
    borderColor: "#f2b461"
  },
  ctrlText: {
    color: "#f2b461",
    fontWeight: "800"
  },
  ctrlPrimaryText: {
    color: "#15100b",
    fontWeight: "900"
  },
  error: {
    marginTop: 12,
    color: "#ffd8d4",
    fontWeight: "700"
  },
  closeBtn: {
    marginTop: 18,
    alignSelf: "flex-start"
  },
  closeText: {
    color: "#f2b461",
    fontWeight: "800"
  }
});
