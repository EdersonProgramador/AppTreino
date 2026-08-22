import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { apiGet } from "../../auth/api";
import { mediaUrl } from "../../lib/media";
import { musicPlayback, type NativeTrack } from "../../musicPlayback";
import { readLikedIds, toggleLikedId, writeLikedIds } from "../../student/likes";
import { StudentPage } from "../../student/layout";
import { useStudent } from "../../student/StudentContext";
import { st } from "../../student/theme";
import { uiSounds } from "../../student/uiSounds";
import type { MusicAlbum, MusicTrack } from "../../types";

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

function withAlbumMeta(album: MusicAlbum): MusicTrack[] {
  return album.tracks.map((track) => ({
    ...track,
    coverUrl: track.coverUrl || album.coverUrl,
    artist: track.artist || album.title,
    albumId: album.id
  }));
}

function formatClock(seconds?: number | null) {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "—";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function shuffleTracks<T>(items: T[]) {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

export function PlayScreen() {
  const { session } = useStudent();
  const navigation = useNavigation();
  const [albums, setAlbums] = useState<MusicAlbum[]>([]);
  const [singles, setSingles] = useState<MusicTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [openAlbumId, setOpenAlbumId] = useState<string | null>(null);
  const [likedIds, setLikedIds] = useState<string[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    void readLikedIds().then(setLikedIds);
  }, []);

  useEffect(() => {
    return musicPlayback.subscribe((snapshot) => {
      setCurrentId(snapshot.current?.id ?? null);
      setPlaying(snapshot.playing);
    });
  }, []);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const catalog = await apiGet<{ albums: MusicAlbum[]; singles: MusicTrack[] }>(
          "/student/music/catalog",
          session.token
        );
        if (!live) return;
        setAlbums(catalog.albums);
        setSingles(catalog.singles);
      } catch (caught) {
        if (live) setError(caught instanceof Error ? caught.message : "Não foi possível carregar o Play.");
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [session.token]);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Bom treino pela manhã";
    if (hour < 18) return "Sua trilha da tarde";
    return "Energia para a noite";
  }, []);

  const allTracks = useMemo(() => [...albums.flatMap(withAlbumMeta), ...singles], [albums, singles]);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredAlbums = useMemo(() => {
    if (!normalizedQuery) return albums;
    return albums.filter(
      (album) =>
        album.title.toLowerCase().includes(normalizedQuery) ||
        (album.description ?? "").toLowerCase().includes(normalizedQuery)
    );
  }, [albums, normalizedQuery]);
  const filteredTracks = useMemo(() => {
    if (!normalizedQuery) return allTracks;
    return allTracks.filter(
      (track) =>
        track.title.toLowerCase().includes(normalizedQuery) ||
        (track.artist ?? "").toLowerCase().includes(normalizedQuery)
    );
  }, [allTracks, normalizedQuery]);
  const likedTracks = allTracks.filter((track) => likedIds.includes(track.id));
  const featuredAlbum = albums[0] ?? null;
  const openAlbum = albums.find((album) => album.id === openAlbumId) ?? null;
  const featuredCover =
    mediaUrl(allTracks.find((track) => track.id === currentId)?.coverUrl) ||
    mediaUrl(featuredAlbum?.coverUrl) ||
    mediaUrl(allTracks[0]?.coverUrl);

  async function playQueue(tracks: MusicTrack[], album?: MusicAlbum, startIndex = 0, shuffled = false) {
    const source = shuffled ? shuffleTracks(tracks) : tracks;
    const queue = source.map((track) => toNative(track, album)).filter((item): item is NativeTrack => Boolean(item));
    if (!queue.length) {
      setError("Esta faixa ainda não tem áudio publicado.");
      return;
    }
    await musicPlayback.openQueue(queue, shuffled ? 0 : startIndex, { autoplay: true });
    uiSounds.itemSelect();
    navigation.navigate("NowPlaying" as never);
  }

  async function toggleLike(id: string) {
    const next = toggleLikedId(likedIds, id);
    setLikedIds(next);
    if (next.includes(id)) uiSounds.itemSelect();
    else uiSounds.itemDeselect();
    await writeLikedIds(next);
  }

  return (
    <StudentPage play>
      <View style={styles.shell}>
        {featuredCover ? <Image source={{ uri: featuredCover }} style={styles.ambiance} blurRadius={18} /> : null}
        <LinearGradient colors={["rgba(10,12,16,0.35)", "rgba(10,12,16,0.92)"]} style={StyleSheet.absoluteFill} />
        {openAlbum ? (
          <View style={{ gap: 16 }}>
            <Pressable onPress={() => setOpenAlbumId(null)} style={styles.back}>
              <Ionicons name="chevron-back" size={18} color="#fff" />
              <Text style={styles.backText}>Biblioteca</Text>
            </Pressable>
            <View style={styles.albumHero}>
              {openAlbum.coverUrl ? (
                <Image source={{ uri: mediaUrl(openAlbum.coverUrl) }} style={styles.albumHeroCover} />
              ) : (
                <View style={[styles.albumHeroCover, styles.coverFallback]}>
                  <Ionicons name="disc-outline" size={48} color={st.gold} />
                </View>
              )}
              <Text style={styles.kicker}>Album</Text>
              <Text style={styles.heroTitle}>{openAlbum.title}</Text>
              <Text style={styles.lead}>{openAlbum.description || `${openAlbum.tracks.length} faixas para o treino`}</Text>
              <View style={styles.heroActions}>
                <Pressable onPress={() => void playQueue(withAlbumMeta(openAlbum), openAlbum)} style={styles.cta}>
                  <Ionicons name="play" size={18} color="#15100b" />
                  <Text style={styles.ctaText}>Tocar</Text>
                </Pressable>
                <Pressable onPress={() => void playQueue(withAlbumMeta(openAlbum), openAlbum, 0, true)} style={styles.ghost}>
                  <Ionicons name="shuffle" size={16} color="#fff" />
                  <Text style={styles.ghostText}>Aleatório</Text>
                </Pressable>
              </View>
            </View>
            {withAlbumMeta(openAlbum).map((track, index) => {
              const active = currentId === track.id;
              return (
                <Pressable
                  key={track.id}
                  style={[styles.track, active && styles.trackActive]}
                  onPress={() => void playQueue(withAlbumMeta(openAlbum), openAlbum, index)}
                >
                  <Text style={styles.index}>{active && playing ? "▶" : index + 1}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.trackTitle}>{track.title}</Text>
                    <Text style={styles.trackSub}>{track.artist || openAlbum.title}</Text>
                  </View>
                  <Text style={styles.duration}>{formatClock(track.durationSec)}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <>
            <Text style={styles.kicker}>
              <Ionicons name="musical-notes" size={14} color="#fff" /> Play App Treino Social
            </Text>
            <Text style={styles.heroTitle}>{greeting}</Text>
            <Text style={styles.lead}>Catálogo para o treino, com player completo e fila contínua.</Text>
            {featuredAlbum ? (
              <View style={styles.heroActions}>
                <Pressable onPress={() => void playQueue(withAlbumMeta(featuredAlbum), featuredAlbum)} style={styles.cta}>
                  <Ionicons name="play" size={18} color="#15100b" />
                  <Text style={styles.ctaText}>Ouvir agora</Text>
                </Pressable>
                <Pressable onPress={() => void playQueue(allTracks, undefined, 0, true)} style={styles.ghost}>
                  <Ionicons name="shuffle" size={16} color="#fff" />
                  <Text style={styles.ghostText}>Mix aleatório</Text>
                </Pressable>
              </View>
            ) : null}
            <Pressable
              onPress={() => featuredAlbum && void playQueue(withAlbumMeta(featuredAlbum), featuredAlbum)}
              style={styles.heroArt}
            >
              {featuredCover ? (
                <Image source={{ uri: featuredCover }} style={styles.heroArtCover} />
              ) : (
                <View style={[styles.heroArtCover, styles.coverFallback]} />
              )}
              <View style={styles.heroPlay}>
                <Ionicons name="play" size={28} color="#fff" />
              </View>
            </Pressable>
            <View style={styles.search}>
              <Ionicons name="search" size={16} color="rgba(255,255,255,0.8)" />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Buscar álbum, faixa ou artista"
                placeholderTextColor="rgba(255,255,255,0.55)"
                style={styles.searchInput}
              />
            </View>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {loading ? <ActivityIndicator color={st.gold} style={{ marginTop: 12 }} /> : null}
            {likedTracks.length > 0 && !normalizedQuery ? (
              <View style={styles.block}>
                <View style={styles.blockHead}>
                  <Text style={styles.blockTitle}>Favoritas</Text>
                  <Text style={styles.blockMeta}>{likedTracks.length}</Text>
                </View>
                {likedTracks.slice(0, 6).map((track) => (
                  <Pressable
                    key={`liked-${track.id}`}
                    style={styles.track}
                    onPress={() => void playQueue(likedTracks, undefined, likedTracks.findIndex((item) => item.id === track.id))}
                  >
                    <Ionicons name="heart" size={14} color="#ff5d6c" />
                    {track.coverUrl ? (
                      <Image source={{ uri: mediaUrl(track.coverUrl) }} style={styles.trackCover} />
                    ) : (
                      <View style={styles.trackCover} />
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.trackTitle}>{track.title}</Text>
                      <Text style={styles.trackSub}>{track.artist || "App Treino"}</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            ) : null}
            <View style={styles.block}>
              <View style={styles.blockHead}>
                <Text style={styles.blockTitle}>Álbuns</Text>
                <Text style={styles.blockMeta}>Toque para abrir</Text>
              </View>
              <View style={styles.albums}>
                {filteredAlbums.map((album) => (
                  <View key={album.id} style={styles.album}>
                  <View style={{ position: "relative" }}>
                    <Pressable onPress={() => setOpenAlbumId(album.id)}>
                      {album.coverUrl ? (
                        <Image source={{ uri: mediaUrl(album.coverUrl) }} style={styles.albumCover} />
                      ) : (
                        <View style={[styles.albumCover, styles.coverFallback]}>
                          <Ionicons name="disc-outline" size={36} color={st.gold} />
                        </View>
                      )}
                    </Pressable>
                    <Pressable style={styles.albumPlay} onPress={() => void playQueue(withAlbumMeta(album), album)}>
                      <Ionicons name="play" size={20} color="#fff" />
                    </Pressable>
                  </View>
                    <Pressable onPress={() => setOpenAlbumId(album.id)}>
                      <Text style={styles.albumTitle}>{album.title}</Text>
                      <Text style={styles.trackSub}>{album.tracks.length} faixas</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
              {!loading && !filteredAlbums.length ? <Text style={styles.empty}>Nenhum álbum encontrado.</Text> : null}
            </View>
            <View style={styles.block}>
              <View style={styles.blockHead}>
                <Text style={styles.blockTitle}>Faixas</Text>
                <Text style={styles.blockMeta}>{filteredTracks.length} disponíveis</Text>
              </View>
              {filteredTracks.map((track, index) => {
                const active = currentId === track.id;
                const liked = likedIds.includes(track.id);
                return (
                  <View key={track.id} style={[styles.trackRow, active && styles.trackActive]}>
                    <Pressable style={styles.trackMain} onPress={() => void playQueue(filteredTracks, undefined, index)}>
                      <Text style={styles.index}>{active && playing ? "▶" : index + 1}</Text>
                      {track.coverUrl ? (
                        <Image source={{ uri: mediaUrl(track.coverUrl) }} style={styles.trackCover} />
                      ) : (
                        <View style={[styles.trackCover, styles.coverFallback]} />
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={styles.trackTitle}>{track.title}</Text>
                        <Text style={styles.trackSub}>{track.artist || "App Treino"}</Text>
                      </View>
                      <Text style={styles.duration}>{formatClock(track.durationSec)}</Text>
                      <Ionicons name={active && playing ? "pause" : "play"} size={16} color="#fff" />
                    </Pressable>
                    <Pressable onPress={() => void toggleLike(track.id)} style={styles.like}>
                      <Ionicons name={liked ? "heart" : "heart-outline"} size={16} color={liked ? "#ff5d6c" : "#fff"} />
                    </Pressable>
                  </View>
                );
              })}
              {!loading && !filteredTracks.length ? <Text style={styles.empty}>Nenhuma música encontrada.</Text> : null}
            </View>
          </>
        )}
      </View>
    </StudentPage>
  );
}

const styles = StyleSheet.create({
  shell: { position: "relative", paddingBottom: 24, gap: 12 },
  ambiance: { ...StyleSheet.absoluteFillObject, opacity: 0.45 },
  kicker: { color: "#fff", fontSize: 12, fontWeight: "800", letterSpacing: 1.6, textTransform: "uppercase", marginTop: 8 },
  heroTitle: { color: "#fff", fontSize: 28, fontWeight: "900", letterSpacing: -0.6 },
  lead: { color: "#fff", fontSize: 14, lineHeight: 20, maxWidth: 320 },
  heroActions: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 4 },
  cta: {
    minHeight: 46,
    borderRadius: 999,
    paddingHorizontal: 18,
    backgroundColor: st.gold,
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  ctaText: { color: "#15100b", fontWeight: "900" },
  ghost: {
    minHeight: 46,
    borderRadius: 999,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  ghostText: { color: "#fff", fontWeight: "800" },
  heroArt: { width: 168, height: 168, borderRadius: 18, overflow: "hidden", alignSelf: "flex-end" },
  heroArtCover: { width: "100%", height: "100%", backgroundColor: "#1a1c22" },
  heroPlay: {
    position: "absolute",
    right: 10,
    bottom: 10,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center"
  },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 46,
    borderRadius: 999,
    paddingHorizontal: 14,
    backgroundColor: "rgba(255,255,255,0.12)"
  },
  searchInput: { flex: 1, color: "#fff", fontSize: 14, paddingVertical: 10 },
  error: { color: "#ffd0c8", fontWeight: "700" },
  empty: { color: "rgba(255,255,255,0.92)" },
  block: { gap: 10, marginTop: 8 },
  blockHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  blockTitle: { color: "#fff", fontSize: 18, fontWeight: "800" },
  blockMeta: { color: "rgba(255,255,255,0.92)", fontSize: 12 },
  albums: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  album: { width: "47%", gap: 8, position: "relative" },
  albumCover: { width: "100%", aspectRatio: 1, borderRadius: 14, backgroundColor: "#1a1c22" },
  albumPlay: {
    position: "absolute",
    right: 10,
    bottom: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center"
  },
  albumTitle: { color: "#fff", fontWeight: "800" },
  coverFallback: { alignItems: "center", justifyContent: "center", backgroundColor: "#17181e" },
  track: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  trackRow: { flexDirection: "row", alignItems: "center" },
  trackMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  trackActive: { backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 12, paddingHorizontal: 6 },
  trackCover: { width: 42, height: 42, borderRadius: 8, backgroundColor: "#1a1c22" },
  trackTitle: { color: "#fff", fontWeight: "800" },
  trackSub: { color: "rgba(255,255,255,0.92)", fontSize: 12 },
  duration: { color: "rgba(255,255,255,0.92)", fontSize: 12, width: 36, textAlign: "right" },
  index: { color: "rgba(255,255,255,0.8)", width: 22, textAlign: "center", fontWeight: "700" },
  like: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  back: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start" },
  backText: { color: "#fff", fontWeight: "800" },
  albumHero: { gap: 8, alignItems: "flex-start" },
  albumHeroCover: { width: 160, height: 160, borderRadius: 16, backgroundColor: "#1a1c22" }
});
