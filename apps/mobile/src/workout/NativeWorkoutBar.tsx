import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { apiGet } from "../auth/api";
import { mediaUrl } from "../lib/media";
import { emptyMusicSnapshot, musicPlayback, type MusicPlaybackSnapshot, type NativeTrack } from "../musicPlayback";
import { uiSounds } from "../student/uiSounds";
import { readLikedIds, writeLikedIds } from "../student/likes";
import { useStudent } from "../student/StudentContext";
import type { MusicAlbum, MusicTrack } from "../types";
import { runner } from "./runnerTheme";

function clock(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

function toNative(track: MusicTrack, album?: MusicAlbum): NativeTrack | null {
  const url = mediaUrl(track.audioUrl || track.url);
  if (!url) return null;
  return {
    id: track.id,
    title: track.title,
    artist: track.artist || album?.title || "App Treino",
    artwork: mediaUrl(track.coverUrl || album?.coverUrl),
    url
  };
}

export function NativeWorkoutBar({
  centerContent,
  centerResting,
  centerDisabled,
  onCenterClick,
  nextDisabled,
  onNext
}: {
  centerContent: ReactNode;
  centerResting?: boolean;
  centerDisabled?: boolean;
  onCenterClick: () => void;
  nextDisabled?: boolean;
  nextLabel?: string;
  onNext: () => void;
}) {
  const { session } = useStudent();
  const [music, setMusic] = useState<MusicPlaybackSnapshot>(emptyMusicSnapshot());
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [albumsOpen, setAlbumsOpen] = useState(false);
  const [albums, setAlbums] = useState<MusicAlbum[]>([]);
  const [loadingAlbums, setLoadingAlbums] = useState(false);
  const railWidth = useRef(1);

  useEffect(() => musicPlayback.subscribe(setMusic), []);
  useEffect(() => {
    void readLikedIds().then((ids) => setLiked(new Set(ids)));
  }, []);

  const hasTrack = Boolean(music.current);
  const playing = music.playing;
  const duration = music.durationSec || 0;
  const progress = duration > 0 ? Math.min(1, music.positionSec / duration) : 0;
  const likedCurrent = Boolean(music.current && liked.has(music.current.id));

  async function openAlbums() {
    uiSounds.popupOpen();
    setAlbumsOpen(true);
    setLoadingAlbums(true);
    try {
      const catalog = await apiGet<{ albums: MusicAlbum[] }>("/student/music/catalog", session.token);
      setAlbums(catalog.albums);
    } catch {
      setAlbums([]);
    } finally {
      setLoadingAlbums(false);
    }
  }

  async function playAlbum(album: MusicAlbum) {
    const queue = album.tracks.map((track) => toNative(track, album)).filter((item): item is NativeTrack => Boolean(item));
    if (!queue.length) return;
    uiSounds.itemSelect();
    await musicPlayback.openQueue(queue, 0, { autoplay: true });
    uiSounds.popupClose();
    setAlbumsOpen(false);
  }

  function closeAlbums() {
    uiSounds.popupClose();
    setAlbumsOpen(false);
  }

  async function toggleShuffle() {
    await musicPlayback.setShuffle(!music.shuffle);
  }

  return (
    <>
      <View style={styles.bar}>
        <View style={styles.row}>
          <View style={styles.side}>
            <IconBtn
              name="shuffle"
              active={music.shuffle}
              disabled={!hasTrack}
              onPress={() => {
                uiSounds.radioSelect();
                void toggleShuffle();
              }}
            />
            <IconBtn
              name={music.repeat === "one" ? "repeat" : "repeat-outline"}
              active={music.repeat !== "off"}
              disabled={!hasTrack}
              onPress={() => {
                uiSounds.radioSelect();
                void musicPlayback.cycleRepeat();
              }}
            />
            <IconBtn name="play-skip-back" disabled={!hasTrack} onPress={() => void musicPlayback.prev()} />
          </View>
          <Pressable
            style={[styles.start, centerResting && styles.startRest, centerDisabled && styles.disabled]}
            disabled={centerDisabled}
            onPress={onCenterClick}
          >
            {centerContent}
          </Pressable>
          <View style={[styles.side, styles.sideRight]}>
            <IconBtn name="chevron-forward" disabled={nextDisabled} onPress={onNext} />
            <IconBtn name="play" disabled={!hasTrack || playing} onPress={() => void musicPlayback.play()} />
            <IconBtn name="pause" disabled={!hasTrack || !playing} onPress={() => void musicPlayback.pause()} />
            <IconBtn name="play-skip-forward" disabled={!hasTrack} onPress={() => void musicPlayback.next()} />
          </View>
        </View>

        <View style={styles.session}>
          <View style={styles.trackRow}>
            <Pressable style={styles.trackMain} onPress={() => void openAlbums()}>
              <View style={styles.eq}>
                {[6, 10, 14, 8, 5].map((height, index) => (
                  <View key={index} style={[styles.eqBar, { height }, playing && styles.eqOn]} />
                ))}
              </View>
              {music.current?.artwork ? (
                <Image source={{ uri: music.current.artwork }} style={styles.cover} />
              ) : (
                <View style={styles.cover} />
              )}
              <View style={styles.meta}>
                <Text numberOfLines={1} style={styles.trackTitle}>
                  {music.current?.title || "Escolher álbum"}
                </Text>
                <Text numberOfLines={1} style={styles.trackArtist}>
                  {music.current?.artist || (hasTrack ? "App Treino" : "Toque para ver álbuns")}
                </Text>
              </View>
            </Pressable>
            <Pressable
              style={styles.like}
              disabled={!hasTrack}
              onPress={() => {
                if (!music.current) return;
                setLiked((current) => {
                  const next = new Set(current);
                  if (next.has(music.current!.id)) {
                    next.delete(music.current!.id);
                    uiSounds.itemDeselect();
                  } else {
                    next.add(music.current!.id);
                    uiSounds.itemSelect();
                  }
                  void writeLikedIds([...next]);
                  return next;
                });
              }}
            >
              <Ionicons name={likedCurrent ? "heart" : "heart-outline"} size={20} color={runner.mbGold} />
            </Pressable>
          </View>
          <View style={styles.progressRow}>
            <Text style={styles.time}>{clock(music.positionSec)}</Text>
            <Pressable
              style={styles.railHit}
              disabled={!hasTrack}
              onLayout={(event) => {
                railWidth.current = event.nativeEvent.layout.width || 1;
              }}
              onPress={(event) => {
                if (!hasTrack) return;
                uiSounds.musicSeekCommit();
                void musicPlayback.seekRatio(event.nativeEvent.locationX / Math.max(1, railWidth.current));
              }}
            >
              <View style={styles.rail}>
                <View style={[styles.railFill, { width: `${Math.round(progress * 100)}%` }]} />
                <View style={[styles.thumb, { left: `${Math.round(progress * 100)}%` }]} />
              </View>
            </Pressable>
            <Text style={styles.time}>{clock(duration)}</Text>
          </View>
        </View>
      </View>

      <Modal visible={albumsOpen} transparent animationType="slide" onRequestClose={closeAlbums}>
        <Pressable style={styles.albumBack} onPress={closeAlbums}>
          <Pressable style={styles.albumSheet} onPress={() => undefined}>
            <Text style={styles.albumTitle}>Álbuns</Text>
            {loadingAlbums ? <ActivityIndicator color={runner.goldUi} /> : null}
            <ScrollView style={styles.albumList}>
              {albums.map((album) => {
                const cover = mediaUrl(album.coverUrl);
                return (
                <Pressable key={album.id} style={styles.albumRow} onPress={() => void playAlbum(album)}>
                  {cover ? (
                    <Image source={{ uri: cover }} style={styles.albumCover} />
                  ) : (
                    <View style={styles.albumCover} />
                  )}
                  <View style={styles.flex}>
                    <Text style={styles.albumName}>{album.title}</Text>
                    <Text style={styles.albumMeta}>{album.tracks.length} faixa(s)</Text>
                  </View>
                </Pressable>
                );
              })}
            </ScrollView>
            <Pressable onPress={closeAlbums}>
              <Text style={styles.albumClose}>Fechar</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function IconBtn({
  name,
  disabled,
  active,
  onPress
}: {
  name: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.icon, active && styles.iconActive, disabled && styles.disabled]} disabled={disabled} onPress={onPress}>
      <Ionicons name={name} size={16} color={runner.mbGold} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    marginHorizontal: 8,
    marginBottom: 4,
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 10,
    borderRadius: 20,
    backgroundColor: runner.bar,
    borderWidth: 1,
    borderColor: runner.line,
    gap: 8,
    shadowColor: "#2d2418",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3
  },
  row: { flexDirection: "row", alignItems: "center" },
  side: { flex: 1, flexDirection: "row", justifyContent: "flex-end", gap: 4, flexWrap: "wrap" },
  sideRight: { justifyContent: "flex-start" },
  icon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: runner.line
  },
  iconActive: { borderColor: runner.mbGold, backgroundColor: "rgba(240,180,90,0.18)" },
  start: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    borderWidth: 2,
    borderColor: runner.mbGold
  },
  startRest: { backgroundColor: runner.barElev },
  disabled: { opacity: 0.42 },
  session: {
    borderRadius: 14,
    padding: 8,
    backgroundColor: runner.barElev,
    borderWidth: 1,
    borderColor: runner.line,
    gap: 8
  },
  trackRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  trackMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, minWidth: 0 },
  eq: { flexDirection: "row", alignItems: "flex-end", gap: 2, width: 16, height: 14 },
  eqBar: { width: 2, borderRadius: 1, backgroundColor: runner.mbGold, opacity: 0.45 },
  eqOn: { opacity: 1 },
  cover: { width: 36, height: 36, borderRadius: 8, backgroundColor: "#e8e0d4" },
  meta: { flex: 1, minWidth: 0 },
  flex: { flex: 1 },
  trackTitle: { color: runner.mbIvory, fontWeight: "800", fontSize: 12 },
  trackArtist: { color: runner.mbGold, fontSize: 10, marginTop: 2 },
  like: { padding: 4 },
  progressRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  time: { color: runner.mbGold, fontSize: 10, fontWeight: "600", minWidth: 32 },
  railHit: { flex: 1, height: 28, justifyContent: "center" },
  rail: { height: 2, backgroundColor: "rgba(196,138,40,0.38)", borderRadius: 999 },
  railFill: { height: 2, backgroundColor: runner.mbGold, borderRadius: 999 },
  thumb: { position: "absolute", top: -4, width: 10, height: 10, marginLeft: -5, borderRadius: 5, backgroundColor: "#d4a24a" },
  albumBack: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" },
  albumSheet: { backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, maxHeight: "70%", gap: 12 },
  albumTitle: { color: runner.text, fontWeight: "800", fontSize: 18 },
  albumList: { maxHeight: 360 },
  albumRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  albumCover: { width: 48, height: 48, borderRadius: 10, backgroundColor: "#ebe4d8" },
  albumName: { color: runner.text, fontWeight: "800" },
  albumMeta: { color: runner.muted, fontSize: 12 },
  albumClose: { color: runner.muted, fontWeight: "800", textAlign: "center", paddingVertical: 8 }
});
