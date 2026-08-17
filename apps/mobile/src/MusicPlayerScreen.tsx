import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";
import {
  emptyMusicSnapshot,
  musicPlayback,
  type MusicPlaybackSnapshot,
  type NativeTrack
} from "./musicPlayback";

export type { NativeTrack };

type ScreenProps = {
  onClose: () => void;
};

function useMusicSnapshot() {
  const [snap, setSnap] = useState<MusicPlaybackSnapshot>(emptyMusicSnapshot);
  useEffect(() => musicPlayback.subscribe(setSnap), []);
  return snap;
}

/**
 * UI cheia do Play (somente mobile/Expo).
 * Fechar = volta ao app; áudio segue no musicPlayback (segundo plano no app).
 * Parar musica = encerra o áudio de verdade.
 */
export function MusicPlayerScreen({ onClose }: ScreenProps) {
  const { current, queue, index, playing, loading, error } = useMusicSnapshot();

  const subtitle = useMemo(() => {
    if (!queue.length) return "";
    return `${index + 1} / ${queue.length}`;
  }, [index, queue.length]);

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
        <Text style={styles.backText}>Continuar no app</Text>
      </Pressable>

      {current.artwork ? (
        <Image source={{ uri: current.artwork }} style={styles.artwork} />
      ) : (
        <View style={[styles.artwork, styles.artworkFallback]} />
      )}

      <Text style={styles.title}>{current.title}</Text>
      <Text style={styles.artist}>{current.artist}</Text>
      <Text style={styles.meta}>{subtitle}</Text>
      <Text style={styles.hint}>A musica continua ao fechar. Toque numa faixa no Play para reabrir.</Text>

      {loading && <ActivityIndicator color="#f2b461" style={{ marginTop: 18 }} />}
      {error && <Text style={styles.error}>{error}</Text>}

      <View style={styles.controls}>
        <Pressable onPress={() => void musicPlayback.prev()} style={styles.ctrl}>
          <Text style={styles.ctrlText}>Prev</Text>
        </Pressable>
        <Pressable onPress={() => void musicPlayback.toggle()} style={[styles.ctrl, styles.ctrlPrimary]}>
          <Text style={styles.ctrlPrimaryText}>{playing ? "Pause" : "Play"}</Text>
        </Pressable>
        <Pressable onPress={() => void musicPlayback.next({ autoplay: true })} style={styles.ctrl}>
          <Text style={styles.ctrlText}>Next</Text>
        </Pressable>
      </View>

      <Pressable
        onPress={() => {
          void musicPlayback.stop();
          onClose();
        }}
        style={styles.stopBtn}
      >
        <Text style={styles.stopText}>Parar musica</Text>
      </Pressable>
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
  hint: {
    marginTop: 10,
    color: "rgba(255,247,236,0.45)",
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 16
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
  },
  stopBtn: {
    marginTop: 16,
    alignSelf: "center",
    paddingVertical: 10,
    paddingHorizontal: 14
  },
  stopText: {
    color: "rgba(255,247,236,0.55)",
    fontWeight: "700",
    fontSize: 13
  }
});
