import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { apiGet, apiPost } from "../../auth/api";
import { mediaUrl } from "../../lib/media";
import { brand } from "../../student/brand";
import { EmptyState, GreenButton, OutlineButton, StudentPage } from "../../student/layout";
import { useStudent } from "../../student/StudentContext";
import { useSt, type StudentTokens } from "../../student/theme";
import { uiSounds } from "../../student/uiSounds";
import type { FeedStackParamList } from "../../navigation/types";
import type { SocialPostRow } from "../../types";

const DEFAULT_COVER = "#c4783a";

type PeerProfile = {
  id: string;
  name: string;
  avatarUrl?: string | null;
  bio?: string | null;
  coverColor?: string | null;
  coverUrl?: string | null;
  objective?: string | null;
  level?: string | null;
  city?: string | null;
  state?: string | null;
  isPrivate: boolean;
  followersCount: number;
  followingCount: number;
  postsCount: number;
  following: boolean;
  requested: boolean;
  isMe: boolean;
  canViewPosts: boolean;
  memberSince?: string | null;
  live?: { id: string; title: string; startedAt: string } | null;
};

type Nav = NativeStackNavigationProp<FeedStackParamList>;
type Route = RouteProp<FeedStackParamList, "PeerProfile">;

function handleFromName(name: string) {
  return name.replace(/\s+/g, "") || "atleta";
}

export function PeerProfileScreen() {
  const { session } = useStudent();
  const { st } = useSt();
  const styles = useMemo(() => createStyles(st), [st]);
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const userId = route.params.userId;

  const [peer, setPeer] = useState<PeerProfile | null>(null);
  const [posts, setPosts] = useState<SocialPostRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const data = await apiGet<PeerProfile>(`/student/social/users/${userId}`, session.token);
      if (data.isMe) {
        navigation.navigate("Feed");
        navigation.getParent()?.navigate("MenuTab", { screen: "Profile" });
        return;
      }
      setPeer(data);
      if (data.canViewPosts) {
        const feed = await apiGet<{ posts: SocialPostRow[] }>(
          `/student/social/posts?authorId=${encodeURIComponent(userId)}&mode=for-you`,
          session.token
        );
        setPosts(feed.posts);
      } else {
        setPosts([]);
      }
    } catch (caught) {
      setPeer(null);
      setError(caught instanceof Error ? caught.message : "Não foi possível abrir o perfil.");
    } finally {
      setLoading(false);
    }
  }, [navigation, session.token, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleFollow() {
    if (!peer || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await apiPost<{ following: boolean; requested: boolean }>(
        `/student/social/users/${peer.id}/follow`,
        {},
        session.token
      );
      setPeer((current) =>
        current
          ? {
              ...current,
              following: result.following,
              requested: result.requested,
              followersCount: Math.max(
                0,
                current.followersCount +
                  (result.following && !current.following ? 1 : !result.following && current.following ? -1 : 0)
              ),
              canViewPosts: !current.isPrivate || result.following
            }
          : current
      );
      uiSounds.success();
      if (result.following || (!peer.isPrivate && !result.following)) {
        await load();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível atualizar o follow.");
      uiSounds.error();
    } finally {
      setBusy(false);
    }
  }

  const followersLabel = (peer?.followersCount ?? 0) === 1 ? "Seguidor" : "Seguidores";
  const metaLine = peer
    ? [peer.objective, peer.level, peer.city && peer.state ? `${peer.city}/${peer.state}` : peer.city]
        .filter(Boolean)
        .join(" · ")
    : "";
  const coverImageUrl = peer?.coverUrl ? mediaUrl(peer.coverUrl) : null;
  const coverColor = peer?.coverColor || DEFAULT_COVER;

  return (
    <StudentPage>
      <Pressable style={styles.back} onPress={() => navigation.goBack()} hitSlop={10}>
        <Ionicons name="chevron-back" size={18} color={st.text} />
        <Text style={styles.backText}>Voltar</Text>
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading && !peer ? (
        <View style={styles.loading}>
          <ActivityIndicator color={st.gold} />
          <Text style={styles.hint}>Carregando perfil…</Text>
        </View>
      ) : null}

      {peer ? (
        <>
          <View style={styles.card}>
            <View style={[styles.cover, { backgroundColor: coverColor }]}>
              {coverImageUrl ? <Image source={{ uri: coverImageUrl }} style={StyleSheet.absoluteFillObject} /> : null}
              <Text style={styles.handle}>@{handleFromName(peer.name)}</Text>
              {peer.live ? (
                <Pressable
                  style={styles.livePill}
                  onPress={() =>
                    navigation.navigate("LiveRoom", {
                      mode: "viewer",
                      liveId: peer.live!.id,
                      title: peer.live!.title
                    })
                  }
                >
                  <Ionicons name="radio" size={12} color="#fff" />
                  <Text style={styles.livePillText}>AO VIVO · {peer.live.title}</Text>
                </Pressable>
              ) : null}
            </View>

            <View style={styles.body}>
              <View style={[styles.avatarWrap, peer.live ? styles.avatarLive : null]}>
                {peer.avatarUrl ? (
                  <Image source={{ uri: mediaUrl(peer.avatarUrl) }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarFallback]}>
                    <Ionicons name="person" size={36} color={st.gold} />
                  </View>
                )}
                {peer.live ? (
                  <View style={styles.liveBadge}>
                    <Text style={styles.liveBadgeText}>LIVE</Text>
                  </View>
                ) : null}
              </View>

              <Text style={styles.name}>{peer.name}</Text>
              {metaLine ? <Text style={styles.meta}>{metaLine}</Text> : null}
              <View style={styles.stats}>
                <Text style={styles.stat}>
                  <Text style={styles.statStrong}>{peer.followingCount}</Text> Seguindo
                </Text>
                <Text style={styles.stat}>
                  <Text style={styles.statStrong}>{peer.followersCount}</Text> {followersLabel}
                </Text>
                <Text style={styles.stat}>
                  <Text style={styles.statStrong}>{peer.postsCount}</Text> publicações
                </Text>
              </View>
              <Text style={styles.bio}>
                {peer.canViewPosts ? peer.bio?.trim() || "Sem biografia" : "Conta privada"}
              </Text>
              {peer.isPrivate ? <Text style={styles.private}>Conta privada</Text> : null}

              <View style={styles.actions}>
                <GreenButton
                  label={peer.following ? "Seguindo" : peer.requested ? "Solicitado" : "Seguir"}
                  onPress={() => void toggleFollow()}
                  disabled={busy}
                />
                <OutlineButton
                  label="Mensagem"
                  icon="chatbubble-outline"
                  onPress={() =>
                    navigation.navigate("DirectMessage", { userId: peer.id, name: peer.name })
                  }
                />
                {peer.live ? (
                  <OutlineButton
                    label="Assistir live"
                    icon="radio-outline"
                    onPress={() =>
                      navigation.navigate("LiveRoom", {
                        mode: "viewer",
                        liveId: peer.live!.id,
                        title: peer.live!.title
                      })
                    }
                  />
                ) : null}
              </View>
            </View>
          </View>

          <View style={styles.gridHead}>
            <Text style={styles.gridTitle}>Publicações</Text>
            <Text style={styles.gridCount}>{peer.canViewPosts ? peer.postsCount : "Privado"}</Text>
          </View>

          {!peer.canViewPosts ? (
            <Text style={styles.hint}>Siga esta conta para ver as publicações.</Text>
          ) : posts.length === 0 ? (
            <EmptyState
              icon="images-outline"
              title="Nenhuma publicação ainda"
              text={`Quando ${peer.name.split(" ")[0]} publicar, aparece aqui.`}
            />
          ) : (
            <View style={styles.grid}>
              {posts.map((post) => {
                const media =
                  post.mediaItems?.[0] ??
                  (post.mediaUrl ? { url: post.mediaUrl, type: post.mediaType, coverUrl: null } : null);
                const isVideo = media?.type === "VIDEO";
                const thumb = (isVideo ? media?.coverUrl : null) || media?.url || null;
                return (
                  <View key={post.id} style={styles.gridItem}>
                    {thumb ? (
                      <Image source={{ uri: mediaUrl(thumb) }} style={styles.gridThumb} />
                    ) : (
                      <Text style={styles.gridText} numberOfLines={4}>
                        {post.body?.slice(0, 80) || brand.athlete}
                      </Text>
                    )}
                    {isVideo ? (
                      <View style={styles.videoBadge}>
                        <Ionicons name="play" size={12} color="#fff" />
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          )}
        </>
      ) : null}
    </StudentPage>
  );
}

function createStyles(st: StudentTokens) {
  return StyleSheet.create({
    back: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 16, marginBottom: 8 },
    backText: { color: st.text, fontWeight: "700", fontSize: 14 },
    error: { color: "#c0392b", marginHorizontal: 16, marginBottom: 8 },
    loading: { alignItems: "center", gap: 10, paddingVertical: 40 },
    hint: { color: st.muted, fontSize: 13, paddingHorizontal: 16, marginBottom: 12 },
    card: {
      marginHorizontal: 16,
      borderRadius: 18,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: st.border,
      backgroundColor: st.panel,
      marginBottom: 16
    },
    cover: { minHeight: 120, justifyContent: "flex-end", padding: 12 },
    handle: { color: "#fff", fontWeight: "800", textShadowColor: "rgba(0,0,0,0.35)", textShadowRadius: 4 },
    livePill: {
      alignSelf: "flex-start",
      marginTop: 8,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: "#c0392b",
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5
    },
    livePillText: { color: "#fff", fontWeight: "800", fontSize: 11 },
    body: { padding: 14, gap: 6 },
    avatarWrap: { marginTop: -42, alignSelf: "flex-start" },
    avatarLive: { borderWidth: 2, borderColor: "#c0392b", borderRadius: 40, padding: 2 },
    avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: st.fill },
    avatarFallback: { alignItems: "center", justifyContent: "center" },
    liveBadge: {
      position: "absolute",
      bottom: -2,
      alignSelf: "center",
      backgroundColor: "#c0392b",
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6
    },
    liveBadgeText: { color: "#fff", fontSize: 9, fontWeight: "900" },
    name: { color: st.text, fontSize: 22, fontWeight: "800", marginTop: 8 },
    meta: { color: st.muted, fontSize: 13 },
    stats: { flexDirection: "row", flexWrap: "wrap", gap: 14, marginTop: 6 },
    stat: { color: st.muted, fontSize: 13 },
    statStrong: { color: st.text, fontWeight: "800" },
    bio: { color: st.text, fontSize: 14, lineHeight: 20, marginTop: 4 },
    private: { color: st.gold, fontWeight: "700", fontSize: 12 },
    actions: { gap: 8, marginTop: 10 },
    gridHead: {
      flexDirection: "row",
      alignItems: "baseline",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      marginBottom: 10
    },
    gridTitle: { color: st.text, fontWeight: "800", fontSize: 16 },
    gridCount: { color: st.muted, fontSize: 12 },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 16, paddingBottom: 24 },
    gridItem: {
      width: "31.5%",
      aspectRatio: 1,
      borderRadius: 12,
      overflow: "hidden",
      backgroundColor: st.panel,
      borderWidth: 1,
      borderColor: st.border,
      alignItems: "center",
      justifyContent: "center",
      padding: 6
    },
    gridThumb: { width: "100%", height: "100%" },
    gridText: { color: st.muted, fontSize: 11, textAlign: "center" },
    videoBadge: {
      position: "absolute",
      top: 6,
      right: 6,
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: "rgba(0,0,0,0.55)",
      alignItems: "center",
      justifyContent: "center"
    }
  });
}
