import { useEffect, useState } from "react";
import { Alert, Image, Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useNavigation } from "@react-navigation/native";
import { apiGet, apiPost, apiPut, apiUploadFile, NativeApiError } from "../../auth/api";
import { mediaUrl } from "../../lib/media";
import { MediaImage } from "../../lib/MediaImage";
import { shareSocialPost } from "../../lib/shareSocialPost";
import { brand } from "../../student/brand";
import { BackChip, EmptyState, GreenButton, OutlineButton, SheetHeading, StudentPage } from "../../student/layout";
import { useMenuStyles } from "../../student/menuStyles";
import { PerformanceCharts } from "../../student/PerformanceCharts";
import { StreakCalendar } from "../../student/StreakCalendar";
import { useStudent } from "../../student/StudentContext";
import { useSt } from "../../student/theme";
import { uiSounds } from "../../student/uiSounds";
import type { SocialPostRow, StudentProfile } from "../../types";
import { FeedCommentsSheet } from "./FeedCommentsSheet";

const COVER_COLORS = ["#c4783a", "#e06a3c", "#f0b45a", "#8b5a2b", "#2d4a3e", "#1a1c1f", "#3d2a1f", "#5c3d2e"];
const DEFAULT_COVER = "#c4783a";

type AthleteSocial = {
  id: string;
  followersCount: number;
  followingCount: number;
  postsCount: number;
  isPrivate: boolean;
  bio?: string | null;
  coverColor?: string | null;
  coverUrl?: string | null;
};

export function ProfileScreen() {
  const { profile, session, refresh, streak, streakDayKinds, consistency } = useStudent();
  const { st } = useSt();
  const styles = useMenuStyles();
  const navigation = useNavigation<any>();
  const [athleteSocial, setAthleteSocial] = useState<AthleteSocial | null>(null);
  const [posts, setPosts] = useState<SocialPostRow[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [coverColor, setCoverColor] = useState(profile?.coverColor || DEFAULT_COVER);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverUri, setCoverUri] = useState<string | null>(null);
  const [removeCover, setRemoveCover] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [commentPostId, setCommentPostId] = useState<string | null>(null);
  const now = new Date();
  const [calMonth, setCalMonth] = useState(now.getMonth() + 1);

  useEffect(() => {
    if (!session.token) return;
    void (async () => {
      try {
        const me = await apiGet<AthleteSocial>("/student/social/me", session.token);
        setAthleteSocial(me);
        setBio(me.bio ?? profile?.bio ?? "");
        setCoverColor(me.coverColor || profile?.coverColor || DEFAULT_COVER);
        const feed = await apiGet<{ posts: SocialPostRow[] }>(
          `/student/social/posts?authorId=${encodeURIComponent(me.id)}&mode=for-you`,
          session.token
        );
        setPosts(feed.posts);
      } catch {
        setAthleteSocial(null);
        setPosts([]);
      }
    })();
  }, [session.token, profile?.bio, profile?.coverColor, profile?.coverUrl, profile?.avatarUrl]);

  async function pickImage() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.85 });
    if (result.canceled || !result.assets[0]) return null;
    return result.assets[0];
  }

  async function pickAvatar() {
    const asset = await pickImage();
    if (!asset) return;
    setAvatarUri(asset.uri);
    setAvatarPreview(asset.uri);
    uiSounds.screenshot();
  }

  async function pickCover() {
    const asset = await pickImage();
    if (!asset) return;
    setCoverUri(asset.uri);
    setCoverPreview(asset.uri);
    setRemoveCover(false);
    uiSounds.screenshot();
  }

  async function saveSocial() {
    if (!session.token) return;
    try {
      setBusy(true);
      let nextAvatar: string | undefined;
      if (avatarUri) {
        const uploaded = await apiUploadFile<{ file: { url: string } }>("/user/uploads", avatarUri, session.token, "avatar.jpg");
        nextAvatar = uploaded.file.url;
      }
      let nextCover: string | null | undefined;
      if (coverUri) {
        const uploaded = await apiUploadFile<{ file: { url: string } }>("/user/uploads", coverUri, session.token, "cover.jpg");
        nextCover = uploaded.file.url;
      } else if (removeCover) {
        nextCover = "";
      }
      const response = await apiPut<{ profile: StudentProfile }>(
        "/user/profile",
        {
          bio: bio.trim(),
          coverColor,
          ...(nextAvatar ? { avatarUrl: nextAvatar } : {}),
          ...(nextCover !== undefined ? { coverUrl: nextCover } : {})
        },
        session.token
      );
      await refresh();
      setAthleteSocial((current) =>
        current
          ? {
              ...current,
              bio: response.profile.bio ?? bio.trim(),
              coverColor: response.profile.coverColor ?? coverColor,
              coverUrl: response.profile.coverUrl ?? (nextCover === "" ? null : current.coverUrl)
            }
          : current
      );
      setAvatarUri(null);
      setAvatarPreview(null);
      setCoverUri(null);
      setCoverPreview(null);
      setRemoveCover(false);
      setEditOpen(false);
      uiSounds.success();
    } catch (caught) {
      Alert.alert("Perfil", caught instanceof NativeApiError ? caught.message : "Não foi possível salvar.");
      uiSounds.error();
    } finally {
      setBusy(false);
    }
  }

  async function toggleLike(id: string) {
    try {
      const result = await apiPost<{ liked: boolean }>(`/student/social/posts/${id}/like`, {}, session.token);
      setPosts((current) =>
        current.map((post) =>
          post.id === id
            ? {
                ...post,
                likedByMe: result.liked,
                likesCount: Math.max(
                  0,
                  post.likesCount + (result.liked && !post.likedByMe ? 1 : !result.liked && post.likedByMe ? -1 : 0)
                )
              }
            : post
        )
      );
    } catch {
      uiSounds.error();
    }
  }

  const savedCoverUrl = athleteSocial?.coverUrl || profile?.coverUrl;
  const coverImageUrl = editOpen
    ? coverPreview
      ? coverPreview
      : !removeCover && savedCoverUrl
        ? mediaUrl(savedCoverUrl)
        : null
    : savedCoverUrl
      ? mediaUrl(savedCoverUrl)
      : null;
  const cover = (editOpen ? coverColor : profile?.coverColor || athleteSocial?.coverColor) || DEFAULT_COVER;
  const handle = (profile?.name ?? brand.athlete).replace(/\s+/g, "");
  const preview = avatarPreview || mediaUrl(profile?.avatarUrl);
  const meta = [profile?.objective, profile?.level, profile?.city && profile?.state ? `${profile.city}/${profile.state}` : profile?.city]
    .filter(Boolean)
    .join(" · ");
  const memberSince = profile?.createdAt
    ? new Date(profile.createdAt).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      })
    : null;
  const postsCount = athleteSocial?.postsCount ?? posts.length;
  const viewerPost = viewerIndex != null ? posts[viewerIndex] : null;
  const monthLabel = new Date(now.getFullYear(), calMonth - 1, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric"
  });

  return (
    <StudentPage>
      <BackChip label="Voltar" onPress={() => navigation.goBack()} />
      <View style={{ borderRadius: 18, overflow: "hidden", borderWidth: 1, borderColor: st.line, backgroundColor: st.panelBg }}>
        <View style={{ minHeight: 148, backgroundColor: cover, justifyContent: "flex-end", padding: 12 }}>
          {coverImageUrl ? (
            <Image source={{ uri: coverImageUrl }} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
          ) : null}
          <Pressable
            onPress={() => {
              uiSounds.popupOpen();
              setEditOpen(true);
            }}
            style={{
              position: "absolute",
              top: 12,
              right: 12,
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: "#fff",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 2
            }}
          >
            <Ionicons name="pencil" size={16} color="#1a1c1f" />
          </Pressable>
          <View style={{ alignSelf: "flex-end", backgroundColor: "rgba(255,255,255,0.9)", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, zIndex: 2 }}>
            <Text style={{ color: "#1a1c1f", fontWeight: "800" }}>{handle}</Text>
          </View>
        </View>
        <View style={{ paddingHorizontal: 14, paddingBottom: 16 }}>
          <View
            style={{
              width: 88,
              height: 88,
              borderRadius: 44,
              marginTop: -36,
              borderWidth: 4,
              borderColor: st.panelBg,
              overflow: "hidden",
              backgroundColor: st.bg,
              alignItems: "center",
              justifyContent: "center"
            }}
          >
            {preview ? <Image source={{ uri: preview }} style={{ width: "100%", height: "100%" }} /> : <Ionicons name="person" size={36} color={st.gold} />}
          </View>
          <Text style={[styles.title, { marginTop: 8 }]}>{profile?.name ?? brand.athlete}</Text>
          {meta ? <Text style={styles.muted}>{meta}</Text> : null}
          <View style={{ flexDirection: "row", gap: 16, marginTop: 10 }}>
            <Text style={styles.muted}>
              <Text style={styles.title}>{athleteSocial?.followingCount ?? 0}</Text> Seguindo
            </Text>
            <Text style={styles.muted}>
              <Text style={styles.title}>{athleteSocial?.followersCount ?? 0}</Text>{" "}
              {(athleteSocial?.followersCount ?? 0) === 1 ? "Seguidor" : "Seguidores"}
            </Text>
          </View>
          <Text style={[styles.muted, { marginTop: 10 }]}>{(profile?.bio || athleteSocial?.bio)?.trim() || "Sem biografia"}</Text>
          {memberSince ? <Text style={[styles.faint, { marginTop: 6 }]}>Atleta desde {memberSince}</Text> : null}
          {athleteSocial?.isPrivate ? <Text style={[styles.badge, { marginTop: 8 }]}>Conta privada</Text> : null}
          <View style={{ marginTop: 12, gap: 8 }}>
            <OutlineButton label="Configurações do perfil" icon="settings-outline" onPress={() => navigation.navigate("ProfileSettings")} />
          </View>
        </View>
      </View>

      <View style={[styles.card, { gap: 8 }]}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={styles.gold}>Ofensiva</Text>
          <Text style={styles.title}>{streak} dia(s)</Text>
        </View>
        <StreakCalendar
          year={now.getFullYear()}
          month={calMonth}
          dayKinds={streakDayKinds}
          monthLabel={monthLabel}
          gender={profile?.gender}
          canPrev={calMonth > 1}
          canNext={calMonth < now.getMonth() + 1}
          onPrev={() => setCalMonth((value) => Math.max(1, value - 1))}
          onNext={() => setCalMonth((value) => Math.min(now.getMonth() + 1, value + 1))}
          caption="Ao concluir treino, corrida, caminhada ou pedal, o dia ganha o ícone da modalidade."
        />
      </View>

      <PerformanceCharts streak={streak} sportTotals={consistency?.sportTotals} weeklyVolume={consistency?.weeklyVolume} />

      <SheetHeading kicker="Feed" title={`Minhas publicações (${postsCount})`} subtitle="Posts e atividades compartilhados por você." />
      {posts.length === 0 ? (
        <EmptyState icon="images-outline" title="Nenhuma publicação ainda :(" text="Publique no Feed ou finalize uma Corrida." />
      ) : (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 16 }}>
          {posts.map((post, index) => {
            const first = post.mediaItems?.[0];
            const isVideo = post.mediaType === "VIDEO" || first?.type === "VIDEO";
            const thumb = (isVideo ? first?.coverUrl : null) || first?.url || post.mediaUrl;
            return (
              <Pressable
                key={post.id}
                onPress={() => {
                  uiSounds.itemSelect();
                  setViewerIndex(index);
                }}
                style={{
                  width: "31.5%",
                  aspectRatio: 1,
                  borderRadius: 12,
                  overflow: "hidden",
                  backgroundColor: st.panelBg,
                  borderWidth: 1,
                  borderColor: st.line,
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                {thumb ? (
                  <MediaImage uri={thumb} style={{ width: "100%", height: "100%" }} />
                ) : (
                  <Text style={[styles.muted, { padding: 6 }]} numberOfLines={4}>
                    {post.body || "Publicação"}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>
      )}

      {editOpen ? (
        <View style={[styles.card, { gap: 12 }]}>
          <Text style={styles.gold}>Editar perfil social</Text>
          <OutlineButton label="Trocar foto" icon="camera-outline" onPress={() => void pickAvatar()} />
          <Text style={styles.label}>Biografia</Text>
          <TextInput
            value={bio}
            onChangeText={setBio}
            maxLength={280}
            multiline
            placeholder="Conte um pouco sobre seu treino e corrida…"
            placeholderTextColor={st.faint}
            style={[styles.input, { minHeight: 80 }]}
          />
          <Text style={styles.label}>Capa do perfil</Text>
          <View style={{ height: 90, borderRadius: 12, overflow: "hidden", backgroundColor: coverColor, borderWidth: 1, borderColor: st.line }}>
            {coverImageUrl ? <Image source={{ uri: coverImageUrl }} style={{ width: "100%", height: "100%" }} /> : null}
          </View>
          <OutlineButton label="Adicionar imagem da capa" icon="image-outline" onPress={() => void pickCover()} />
          {(coverPreview || savedCoverUrl) && !removeCover ? (
            <OutlineButton
              label="Remover foto da capa"
              icon="trash-outline"
              onPress={() => {
                setCoverUri(null);
                setCoverPreview(null);
                setRemoveCover(true);
              }}
            />
          ) : null}
          <Text style={styles.label}>Ou escolha uma cor de fundo</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {COVER_COLORS.map((color) => (
              <Pressable
                key={color}
                onPress={() => setCoverColor(color)}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: color,
                  borderWidth: coverColor === color ? 3 : 0,
                  borderColor: "#fff"
                }}
              />
            ))}
          </View>
          <GreenButton label={busy ? "Salvando…" : "Salvar"} loading={busy} onPress={() => void saveSocial()} />
          <OutlineButton
            label="Dados cadastrais"
            icon="settings-outline"
            onPress={() => {
              setEditOpen(false);
              navigation.navigate("ProfileSettings");
            }}
          />
          <OutlineButton
            label="Cancelar"
            onPress={() => {
              setEditOpen(false);
              setAvatarUri(null);
              setAvatarPreview(null);
              setCoverUri(null);
              setCoverPreview(null);
              setRemoveCover(false);
              uiSounds.popupClose();
            }}
          />
        </View>
      ) : null}

      <Modal visible={viewerPost != null} animationType="slide" onRequestClose={() => setViewerIndex(null)}>
        <View style={{ flex: 1, backgroundColor: st.bg, paddingTop: 48 }}>
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 12, gap: 8 }}>
            <Pressable onPress={() => setViewerIndex(null)} hitSlop={10}>
              <Ionicons name="chevron-back" size={24} color={st.text} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Publicações</Text>
              <Text style={styles.faint}>
                {profile?.name}
                {posts.length > 1 && viewerIndex != null ? ` · ${viewerIndex + 1}/${posts.length}` : ""}
              </Text>
            </View>
            <Pressable onPress={() => setViewerIndex(null)}>
              <Ionicons name="close" size={22} color={st.text} />
            </Pressable>
          </View>
          {viewerPost ? (
            <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
              {viewerPost.body ? <Text style={styles.muted}>{viewerPost.body}</Text> : null}
              {(viewerPost.mediaItems ?? (viewerPost.mediaUrl ? [{ url: viewerPost.mediaUrl, type: viewerPost.mediaType ?? "IMAGE" }] : [])).map(
                (item) => (
                  <MediaImage key={item.url} uri={item.url} style={{ width: "100%", aspectRatio: 1, borderRadius: 16 }} />
                )
              )}
              <View style={{ flexDirection: "row", gap: 18 }}>
                <Pressable onPress={() => void toggleLike(viewerPost.id)} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Ionicons name={viewerPost.likedByMe ? "thumbs-up" : "thumbs-up-outline"} size={20} color={st.gold} />
                  <Text style={styles.title}>{viewerPost.likesCount}</Text>
                </Pressable>
                <Pressable onPress={() => setCommentPostId(viewerPost.id)} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Ionicons name="chatbubble-outline" size={20} color={st.gold} />
                  <Text style={styles.title}>{viewerPost.commentsCount ?? viewerPost.comments?.length ?? 0}</Text>
                </Pressable>
                <Pressable onPress={() => void shareSocialPost(viewerPost)}>
                  <Ionicons name="share-outline" size={20} color={st.gold} />
                </Pressable>
              </View>
            </ScrollView>
          ) : null}
        </View>
        <FeedCommentsSheet
          visible={commentPostId != null}
          postId={commentPostId}
          token={session.token}
          onClose={() => setCommentPostId(null)}
          onCountChange={(postId, delta) =>
            setPosts((current) =>
              current.map((post) =>
                post.id === postId ? { ...post, commentsCount: Math.max(0, (post.commentsCount ?? 0) + delta) } : post
              )
            )
          }
        />
      </Modal>
    </StudentPage>
  );
}
