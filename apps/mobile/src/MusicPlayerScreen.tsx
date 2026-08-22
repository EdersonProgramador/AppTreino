import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  emptyMusicSnapshot,
  musicPlayback,
  type MusicPlaybackSnapshot,
  type NativeTrack
} from "./musicPlayback";
import { readLikedIds, toggleLikedId, writeLikedIds } from "./student/likes";
import { uiSounds } from "./student/uiSounds";

export type { NativeTrack };

type ScreenProps = {
  onClose: () => void;
};

function useMusicSnapshot() {
  const [snap, setSnap] = useState<MusicPlaybackSnapshot>(emptyMusicSnapshot());
  useEffect(() => musicPlayback.subscribe(setSnap), []);
  return snap;
}

function formatClock(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

export function MusicPlayerScreen({ onClose }: ScreenProps) {
  const { current, queue, index, playing, loading, error, positionSec, durationSec, volume, shuffle, repeat } =
    useMusicSnapshot();
  const progress = durationSec > 0 ? Math.min(1, positionSec / durationSec) : 0;
  const seekWidth = useRef(1);
  const volumeWidth = useRef(1);
  const [likedIds, setLikedIds] = useState<string[]>([]);

  useEffect(() => {
    void readLikedIds().then(setLikedIds);
  }, []);

  const liked = Boolean(current && likedIds.includes(current.id));
  const subtitle = useMemo(() => {
    if (!queue.length) return "";
    return `${index + 1} / ${queue.length} · ${formatClock(positionSec)} / ${formatClock(durationSec)}`;
  }, [durationSec, index, positionSec, queue.length]);

  async function toggleLike() {
    if (!current) return;
    const next = toggleLikedId(likedIds, current.id);
    setLikedIds(next);
    await writeLikedIds(next);
    uiSounds.toggleOn();
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
        <Text style={styles.backText}>Continuar no app</Text>
      </Pressable>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {current.artwork ? (
          <Image source={{ uri: current.artwork }} style={styles.artwork} />
        ) : (
          <View style={[styles.artwork, styles.artworkFallback]} />
        )}

        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{current.title}</Text>
            <Text style={styles.artist}>{current.artist}</Text>
            <Text style={styles.meta}>{subtitle}</Text>
          </View>
          <Pressable onPress={() => void toggleLike()} style={styles.iconBtn}>
            <Ionicons name={liked ? "heart" : "heart-outline"} size={26} color={liked ? "#f2b461" : "#fff7ec"} />
          </Pressable>
        </View>

        <Pressable
          style={styles.seek}
          onLayout={(event) => {
            seekWidth.current = event.nativeEvent.layout.width || 1;
          }}
          onPress={(event) => {
            void musicPlayback.seekRatio(event.nativeEvent.locationX / Math.max(1, seekWidth.current));
          }}
        >
          <View style={styles.seekRail}>
            <View style={[styles.seekFill, { width: `${Math.round(progress * 100)}%` }]} />
          </View>
        </Pressable>

        <Text style={styles.hint}>Volume</Text>
        <Pressable
          style={styles.seek}
          onLayout={(event) => {
            volumeWidth.current = event.nativeEvent.layout.width || 1;
          }}
          onPress={(event) => {
            void musicPlayback.setVolume(event.nativeEvent.locationX / Math.max(1, volumeWidth.current));
          }}
        >
          <View style={styles.seekRail}>
            <View style={[styles.seekFill, { width: `${Math.round(volume * 100)}%` }]} />
          </View>
        </Pressable>

        {loading ? <ActivityIndicator color="#f2b461" style={{ marginTop: 18 }} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.extra}>
          <Pressable onPress={() => void musicPlayback.setShuffle(!shuffle)} style={[styles.iconBtn, shuffle && styles.iconOn]}>
            <Ionicons name="shuffle" size={22} color={shuffle ? "#15100b" : "#f2b461"} />
          </Pressable>
          <Pressable onPress={() => void musicPlayback.cycleRepeat()} style={[styles.iconBtn, repeat !== "off" && styles.iconOn]}>
            <Ionicons name={repeat === "one" ? "repeat" : "repeat-outline"} size={22} color={repeat !== "off" ? "#15100b" : "#f2b461"} />
          </Pressable>
        </View>

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

        <Text style={styles.queueTitle}>Fila</Text>
        {queue.map((track, trackIndex) => (
          <Pressable
            key={`${track.id}-${trackIndex}`}
            onPress={() => void musicPlayback.playAt(trackIndex)}
            style={[styles.queueRow, trackIndex === index && styles.queueActive]}
          >
            <Text style={styles.queueIndex}>{trackIndex === index && playing ? "▶" : trackIndex + 1}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.queueName} numberOfLines={1}>
                {track.title}
              </Text>
              <Text style={styles.queueArtist} numberOfLines={1}>
                {track.artist}
              </Text>
            </View>
          </Pressable>
        ))}

        <Pressable
          onPress={() => {
            void musicPlayback.stop();
            onClose();
          }}
          style={styles.stopBtn}
        >
          <Text style={styles.stopText}>Parar musica</Text>
        </Pressable>
      </ScrollView>
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
  scroll: { paddingBottom: 28, gap: 4 },
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
  titleRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
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
  seek: {
    marginTop: 16,
    height: 28,
    justifyContent: "center"
  },
  seekRail: {
    height: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,247,236,0.18)",
    overflow: "hidden"
  },
  seekFill: {
    height: "100%",
    backgroundColor: "#f2b461"
  },
  hint: {
    marginTop: 14,
    color: "rgba(255,247,236,0.45)",
    fontSize: 12,
    fontWeight: "600"
  },
  extra: { flexDirection: "row", gap: 10, marginTop: 16 },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(242,180,97,0.35)",
    alignItems: "center",
    justifyContent: "center"
  },
  iconOn: { backgroundColor: "#f2b461", borderColor: "#f2b461" },
  controls: {
    marginTop: 18,
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
  queueTitle: { marginTop: 24, color: "#fff7ec", fontWeight: "800", fontSize: 16 },
  queueRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  queueActive: { opacity: 1 },
  queueIndex: { width: 22, color: "#f2b461", fontWeight: "800" },
  queueName: { color: "#fff7ec", fontWeight: "800" },
  queueArtist: { color: "rgba(255,247,236,0.55)", fontSize: 12 },
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
