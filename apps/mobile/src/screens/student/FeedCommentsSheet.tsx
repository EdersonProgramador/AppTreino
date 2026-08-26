import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiGet, apiPost } from "../../auth/api";
import { mediaUrl } from "../../lib/media";
import { useSt, type StudentTokens } from "../../student/theme";
import type { SocialComment } from "../../types";

const COMMENT_EMOJIS = ["😂", "😮", "😍", "😢", "👏", "🔥", "🎉", "❤️"];

function formatCompactRelative(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const sec = Math.max(0, Math.floor(diffMs / 1000));
  if (sec < 60) return `${Math.max(1, sec)}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}min`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}sem`;
  return new Date(iso).toLocaleDateString("pt-BR", { day: "numeric", month: "short" });
}

function firstName(name: string) {
  return name.split(" ")[0] || name;
}

type Props = {
  visible: boolean;
  postId: string | null;
  token: string;
  fallbackComments?: SocialComment[];
  onClose: () => void;
  onCountChange?: (postId: string, delta: number) => void;
};

export function FeedCommentsSheet({
  visible,
  postId,
  token,
  fallbackComments = [],
  onClose,
  onCountChange
}: Props) {
  const { st } = useSt();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(st), [st]);
  const inputRef = useRef<TextInput>(null);
  const replyToRef = useRef<{ id: string; name: string } | null>(null);

  const [comments, setComments] = useState<SocialComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null);

  const fallbackRef = useRef(fallbackComments);
  fallbackRef.current = fallbackComments;

  useEffect(() => {
    if (!visible || !postId) return;
    let cancelled = false;
    setDraft("");
    replyToRef.current = null;
    setReplyTo(null);
    setLoading(true);
    void (async () => {
      try {
        const data = await apiGet<{ comments: SocialComment[] }>(`/student/social/posts/${postId}/comments`, token);
        if (!cancelled) setComments(data.comments);
      } catch {
        if (!cancelled) setComments(fallbackRef.current);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, postId, token]);

  function startReply(target: { rootId: string; name: string }) {
    const next = { id: target.rootId, name: target.name };
    replyToRef.current = next;
    setReplyTo(next);
    setDraft((current) => {
      const mention = `@${target.name} `;
      if (current.trim().startsWith(`@${target.name}`)) return current;
      return current.trim() ? `${mention}${current}` : mention;
    });
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function clearReply() {
    replyToRef.current = null;
    setReplyTo(null);
  }

  async function toggleCommentLike(commentId: string) {
    const result = await apiPost<{ liked: boolean }>(`/student/social/comments/${commentId}/like`, {}, token);
    function patch(list: SocialComment[]): SocialComment[] {
      return list.map((comment) => {
        if (comment.id === commentId) {
          const likesCount = Math.max(0, (comment.likesCount ?? 0) + (result.liked ? 1 : -1));
          return { ...comment, likedByMe: result.liked, likesCount };
        }
        if (comment.replies?.length) return { ...comment, replies: patch(comment.replies) };
        return comment;
      });
    }
    setComments((current) => patch(current));
  }

  async function sendComment() {
    if (!postId) return;
    const text = draft.trim();
    if (!text || busy) return;
    const parentId = replyToRef.current?.id ?? replyTo?.id ?? null;
    setBusy(true);
    try {
      const result = await apiPost<{ comment: SocialComment }>(
        `/student/social/posts/${postId}/comments`,
        { body: text, parentId },
        token
      );
      const comment = result.comment;
      setDraft("");
      clearReply();
      setComments((current) => {
        const replyParentId = comment.parentId ?? parentId;
        if (replyParentId) {
          let nested = false;
          const next = current.map((row) => {
            if (row.id !== replyParentId) return row;
            nested = true;
            return {
              ...row,
              replies: [...(row.replies ?? []).filter((item) => item.id !== comment.id), { ...comment, replies: [] }],
              repliesCount: (row.repliesCount ?? row.replies?.length ?? 0) + 1
            };
          });
          if (nested) return next;
        }
        return [...current.filter((row) => row.id !== comment.id), { ...comment, replies: comment.replies ?? [] }];
      });
      onCountChange?.(postId, 1);
    } finally {
      setBusy(false);
    }
  }

  function renderItem(comment: SocialComment, rootId: string, isReply = false) {
    return (
      <View style={[styles.item, isReply && styles.itemReply]} key={comment.id}>
        {comment.author.avatarUrl ? (
          <Image source={{ uri: mediaUrl(comment.author.avatarUrl) }} style={[styles.avatar, isReply && styles.avatarReply]} />
        ) : (
          <View style={[styles.avatar, isReply && styles.avatarReply, styles.avatarFallback]}>
            <Text style={styles.avatarLetter}>{firstName(comment.author.name).slice(0, 1)}</Text>
          </View>
        )}
        <View style={styles.bodyCol}>
          <Text style={styles.bodyText}>
            <Text style={styles.authorName}>{firstName(comment.author.name)} </Text>
            {comment.body}
          </Text>
          <View style={styles.metaRow}>
            <Text style={styles.meta}>{formatCompactRelative(comment.createdAt)}</Text>
            {(comment.likesCount ?? 0) > 0 ? (
              <Text style={styles.meta}>
                {comment.likesCount} curtida{(comment.likesCount ?? 0) === 1 ? "" : "s"}
              </Text>
            ) : null}
            <Pressable
              onPress={() =>
                startReply({
                  rootId,
                  name: firstName(comment.author.name)
                })
              }
              hitSlop={6}
            >
              <Text style={styles.replyBtn}>Responder</Text>
            </Pressable>
          </View>
        </View>
        <Pressable onPress={() => void toggleCommentLike(comment.id)} hitSlop={8} style={styles.likeBtn}>
          <Ionicons
            name={comment.likedByMe ? "heart" : "heart-outline"}
            size={14}
            color={comment.likedByMe ? "#df663c" : st.muted}
          />
        </Pressable>
      </View>
    );
  }

  return (
    <Modal visible={visible && Boolean(postId)} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.card, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>Comentários</Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Fechar">
              <Ionicons name="close" size={20} color={st.muted} />
            </Pressable>
          </View>

          <ScrollView style={styles.list} contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled">
            {loading ? (
              <ActivityIndicator color={st.coral} style={{ marginTop: 24 }} />
            ) : comments.length === 0 ? (
              <Text style={styles.empty}>Nenhum comentário ainda.</Text>
            ) : (
              comments.map((comment) => (
                <View key={comment.id} style={styles.thread}>
                  {renderItem(comment, comment.id, false)}
                  {(comment.replies ?? []).length > 0 ? (
                    <View style={styles.replies}>
                      {(comment.replies ?? []).map((reply) => renderItem(reply, comment.id, true))}
                    </View>
                  ) : null}
                </View>
              ))
            )}
          </ScrollView>

          <View style={styles.composer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.emojiRow}>
              {COMMENT_EMOJIS.map((emoji) => (
                <Pressable key={emoji} onPress={() => setDraft((current) => `${current}${emoji}`)} style={styles.emojiBtn}>
                  <Text style={styles.emoji}>{emoji}</Text>
                </Pressable>
              ))}
            </ScrollView>
            {replyTo ? (
              <View style={styles.replying}>
                <Text style={styles.replyingText}>Respondendo a {replyTo.name}</Text>
                <Pressable onPress={clearReply} hitSlop={8}>
                  <Ionicons name="close" size={14} color={st.muted} />
                </Pressable>
              </View>
            ) : null}
            <View style={styles.inputRow}>
              <TextInput
                ref={inputRef}
                value={draft}
                onChangeText={setDraft}
                placeholder={replyTo ? `Responder a ${replyTo.name}...` : "Adicione um comentário..."}
                placeholderTextColor={st.faint}
                style={styles.input}
                maxLength={500}
                returnKeyType="send"
                onSubmitEditing={() => void sendComment()}
              />
              <Pressable
                onPress={() => void sendComment()}
                disabled={busy || !draft.trim()}
                style={[styles.sendBtn, (!draft.trim() || busy) && styles.sendDisabled]}
                accessibilityLabel="Enviar comentário"
              >
                <Ionicons name="send" size={16} color="#fff" />
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function createStyles(st: StudentTokens) {
  return StyleSheet.create({
    root: { flex: 1, justifyContent: "flex-end" },
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.45)" },
    card: {
      maxHeight: "78%",
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      backgroundColor: st.card,
      overflow: "hidden"
    },
    handle: {
      alignSelf: "center",
      width: 42,
      height: 4,
      borderRadius: 999,
      backgroundColor: st.line,
      marginTop: 8,
      marginBottom: 4
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: st.line
    },
    title: { color: st.text, fontWeight: "800", fontSize: 16 },
    list: { flexGrow: 1 },
    listContent: { paddingHorizontal: 14, paddingVertical: 12, gap: 14 },
    empty: { color: st.muted, textAlign: "center", marginTop: 28, fontSize: 13 },
    thread: { gap: 10 },
    replies: { marginLeft: 44, gap: 10 },
    item: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
    itemReply: {},
    avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: st.fill },
    avatarReply: { width: 28, height: 28, borderRadius: 14 },
    avatarFallback: { alignItems: "center", justifyContent: "center" },
    avatarLetter: { color: st.text, fontWeight: "800", fontSize: 13 },
    bodyCol: { flex: 1, gap: 4 },
    bodyText: { color: st.text, fontSize: 14, lineHeight: 19 },
    authorName: { fontWeight: "800" },
    metaRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10 },
    meta: { color: st.muted, fontSize: 12, fontWeight: "600" },
    replyBtn: { color: st.muted, fontSize: 12, fontWeight: "800" },
    likeBtn: { paddingTop: 2, paddingLeft: 4 },
    composer: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: st.line,
      paddingHorizontal: 12,
      paddingTop: 8,
      gap: 8
    },
    emojiRow: { gap: 4, paddingBottom: 2 },
    emojiBtn: { paddingHorizontal: 4, paddingVertical: 2 },
    emoji: { fontSize: 22 },
    replying: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: st.fill,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 6
    },
    replyingText: { color: st.muted, fontSize: 12, fontWeight: "700" },
    inputRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    input: {
      flex: 1,
      minHeight: 40,
      maxHeight: 96,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: st.line,
      paddingHorizontal: 14,
      paddingVertical: 8,
      color: st.text,
      backgroundColor: st.bgSoft
    },
    sendBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#df663c"
    },
    sendDisabled: { opacity: 0.45 }
  });
}
