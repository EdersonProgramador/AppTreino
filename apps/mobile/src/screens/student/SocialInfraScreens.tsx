import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { io, type Socket } from "socket.io-client";
import * as ImagePicker from "expo-image-picker";
import { apiGet, apiPost, apiUploadFile } from "../../auth/api";
import { API_URL } from "../../config";
import { mediaUrl } from "../../lib/media";
import { EmptyState, GreenButton, StudentPage } from "../../student/layout";
import { useStudent } from "../../student/StudentContext";
import { useSt, type StudentTokens } from "../../student/theme";
import type { SocialAuthor } from "../../types";
import type { FeedStackParamList } from "../../navigation/types";

let socket: Socket | null = null;

function getSocket(token: string) {
  if (socket?.connected) return socket;
  socket?.disconnect();
  socket = io(API_URL, { path: "/socket.io", auth: { token }, transports: ["websocket"] });
  return socket;
}

type Nav = NativeStackNavigationProp<FeedStackParamList>;

export function ReelsScreen() {
  const { session } = useStudent();
  const { st } = useSt();
  const styles = useMemo(() => createStyles(st), [st]);
  const navigation = useNavigation<Nav>();
  const [reels, setReels] = useState<
    Array<{ id: string; videoUrl: string; caption: string; author: SocialAuthor; likesCount: number; likedByMe: boolean }>
  >([]);

  useEffect(() => {
    void apiGet<{ reels: typeof reels }>("/student/social/reels", session.token).then((data) => setReels(data.reels));
  }, [session.token]);

  return (
    <StudentPage>
      <Pressable onPress={() => navigation.goBack()}>
        <Text style={styles.back}>← Feed</Text>
      </Pressable>
      <Text style={styles.title}>Clipes</Text>
      <GreenButton
        label="Novo clipe"
        onPress={async () => {
          const pick = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["videos"], quality: 0.8 });
          if (pick.canceled || !pick.assets[0]) return;
          const uploaded = await apiUploadFile<{ file: { url: string } }>(
            "/student/social/uploads",
            pick.assets[0].uri,
            session.token,
            "reel.mp4"
          );
          await apiPost("/student/social/reels", { videoUrl: uploaded.file.url, caption: "" }, session.token);
          const data = await apiGet<{ reels: typeof reels }>("/student/social/reels", session.token);
          setReels(data.reels);
        }}
      />
      {reels.length === 0 ? (
        <EmptyState icon="film-outline" title="Sem clipes" text="Publique um vídeo vertical." />
      ) : (
        reels.map((reel) => (
          <View key={reel.id} style={styles.card}>
            <Text style={styles.name}>{reel.author.name}</Text>
            <Text style={styles.meta}>{reel.caption || "Clipe"}</Text>
            <Text style={styles.meta}>{mediaUrl(reel.videoUrl)}</Text>
            <Pressable
              style={styles.chip}
              onPress={async () => {
                const result = await apiPost<{ liked: boolean }>(`/student/social/reels/${reel.id}/like`, {}, session.token);
                setReels((current) =>
                  current.map((row) =>
                    row.id === reel.id
                      ? {
                          ...row,
                          likedByMe: result.liked,
                          likesCount: Math.max(0, row.likesCount + (result.liked ? 1 : -1))
                        }
                      : row
                  )
                );
              }}
            >
              <Ionicons name={reel.likedByMe ? "heart" : "heart-outline"} size={16} color={st.coral} />
              <Text style={styles.chipText}>{reel.likesCount}</Text>
            </Pressable>
          </View>
        ))
      )}
    </StudentPage>
  );
}

export function LiveScreen() {
  const { session } = useStudent();
  const { st } = useSt();
  const styles = useMemo(() => createStyles(st), [st]);
  const navigation = useNavigation<Nav>();
  const [lives, setLives] = useState<Array<{ id: string; title: string; host: SocialAuthor; isMine: boolean }>>([]);
  const [title, setTitle] = useState("");

  useEffect(() => {
    void apiGet<{ lives: typeof lives }>("/student/social/live", session.token).then((data) => setLives(data.lives));
  }, [session.token]);

  return (
    <StudentPage>
      <Pressable onPress={() => navigation.goBack()}>
        <Text style={styles.back}>← Feed</Text>
      </Pressable>
      <Text style={styles.title}>Ao vivo</Text>
      <TextInput value={title} onChangeText={setTitle} placeholder="Título da live" style={styles.input} placeholderTextColor={st.faint} />
      <GreenButton
        label="Iniciar ao vivo"
        onPress={async () => {
          if (title.trim().length < 2) return;
          await apiPost("/student/social/live", { title: title.trim() }, session.token);
          const data = await apiGet<{ lives: typeof lives }>("/student/social/live", session.token);
          setLives(data.lives);
          setTitle("");
        }}
      />
      {lives.map((live) => (
        <View key={live.id} style={styles.card}>
          <Text style={styles.name}>{live.title}</Text>
          <Text style={styles.meta}>{live.host.name}</Text>
        </View>
      ))}
    </StudentPage>
  );
}

export function MessagesScreen() {
  const { session } = useStudent();
  const { st } = useSt();
  const styles = useMemo(() => createStyles(st), [st]);
  const navigation = useNavigation<Nav>();
  const [conversations, setConversations] = useState<
    Array<{ id: string; user: SocialAuthor; lastMessage?: { content: string } | null }>
  >([]);

  useEffect(() => {
    void apiGet<{ conversations: typeof conversations }>("/student/social/conversations", session.token).then((data) =>
      setConversations(data.conversations as typeof conversations)
    );
  }, [session.token]);

  return (
    <StudentPage>
      <Pressable onPress={() => navigation.goBack()}>
        <Text style={styles.back}>← Feed</Text>
      </Pressable>
      <Text style={styles.title}>Mensagens</Text>
      {conversations.map((row) => (
        <Pressable
          key={row.id}
          style={styles.card}
          onPress={() => navigation.navigate("DirectMessage", { userId: row.user.id, name: row.user.name })}
        >
          <Text style={styles.name}>{row.user.name}</Text>
          <Text style={styles.meta}>{row.lastMessage?.content || "Nova conversa"}</Text>
        </Pressable>
      ))}
    </StudentPage>
  );
}

export function DirectMessageScreen() {
  const { session } = useStudent();
  const { st } = useSt();
  const styles = useMemo(() => createStyles(st), [st]);
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<FeedStackParamList, "DirectMessage">>();
  const [messages, setMessages] = useState<Array<{ id: string; content: string; isMine?: boolean }>>([]);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    void apiGet<{ messages: typeof messages }>(`/student/social/messages/${route.params.userId}`, session.token).then((data) =>
      setMessages(data.messages)
    );
  }, [route.params.userId, session.token]);

  return (
    <StudentPage>
      <Pressable onPress={() => navigation.goBack()}>
        <Text style={styles.back}>← Mensagens</Text>
      </Pressable>
      <Text style={styles.title}>{route.params.name}</Text>
      {messages.map((msg) => (
        <Text key={msg.id} style={[styles.meta, msg.isMine && { color: st.coral }]}>
          {msg.content}
        </Text>
      ))}
      <TextInput value={draft} onChangeText={setDraft} placeholder="Mensagem" style={styles.input} placeholderTextColor={st.faint} />
      <GreenButton
        label="Enviar"
        onPress={async () => {
          if (!draft.trim()) return;
          const result = await apiPost<{ message: { id: string; content: string; isMine?: boolean } }>(
            `/student/social/messages/${route.params.userId}`,
            { content: draft.trim() },
            session.token
          );
          setMessages((current) => [...current, result.message]);
          setDraft("");
        }}
      />
    </StudentPage>
  );
}

export function ChatScreen() {
  const { session } = useStudent();
  const { st } = useSt();
  const styles = useMemo(() => createStyles(st), [st]);
  const navigation = useNavigation<Nav>();
  const [messages, setMessages] = useState<Array<{ id: string; content: string; name: string; isMine?: boolean }>>([]);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    void apiGet<{ messages: typeof messages }>("/student/social/chat/global", session.token).then((data) => setMessages(data.messages));
    const sock = getSocket(session.token);
    sock.emit("presence:hello");
    sock.on("chat:global", (msg: (typeof messages)[number]) => setMessages((current) => [...current, msg]));
    return () => {
      sock.off("chat:global");
    };
  }, [session.token]);

  return (
    <StudentPage>
      <Pressable onPress={() => navigation.goBack()}>
        <Text style={styles.back}>← Feed</Text>
      </Pressable>
      <Text style={styles.title}>Chat global</Text>
      {messages.map((msg) => (
        <Text key={msg.id} style={styles.meta}>
          <Text style={styles.name}>{msg.name.split(" ")[0]} </Text>
          {msg.content}
        </Text>
      ))}
      <TextInput value={draft} onChangeText={setDraft} placeholder="Mensagem" style={styles.input} placeholderTextColor={st.faint} />
      <GreenButton
        label="Enviar"
        onPress={() => {
          if (!draft.trim()) return;
          getSocket(session.token).emit("chat:global", draft.trim(), (ok: boolean) => {
            if (ok) setDraft("");
          });
        }}
      />
    </StudentPage>
  );
}

export function RequestsScreen() {
  const { session } = useStudent();
  const { st } = useSt();
  const styles = useMemo(() => createStyles(st), [st]);
  const navigation = useNavigation<Nav>();
  const [requests, setRequests] = useState<Array<{ id: string; user: SocialAuthor }>>([]);
  const [isPrivate, setIsPrivate] = useState(false);

  useEffect(() => {
    void Promise.all([
      apiGet<{ requests: typeof requests }>("/student/social/follow-requests", session.token),
      apiGet<{ isPrivate: boolean }>("/student/social/privacy", session.token)
    ]).then(([req, privacy]) => {
      setRequests(req.requests);
      setIsPrivate(privacy.isPrivate);
    });
  }, [session.token]);

  return (
    <StudentPage>
      <Pressable onPress={() => navigation.goBack()}>
        <Text style={styles.back}>← Feed</Text>
      </Pressable>
      <Text style={styles.title}>Pedidos</Text>
      <Pressable
        style={styles.chip}
        onPress={async () => {
          const next = !isPrivate;
          setIsPrivate(next);
          await apiPost("/student/social/privacy", { isPrivate: next }, session.token);
        }}
      >
        <Text style={styles.chipText}>Perfil privado · {isPrivate ? "on" : "off"}</Text>
      </Pressable>
      {requests.map((row) => (
        <View key={row.id} style={styles.card}>
          <Text style={styles.name}>{row.user.name}</Text>
          <View style={styles.row}>
            <GreenButton
              label="Aceitar"
              onPress={async () => {
                await apiPost(`/student/social/follow-requests/${row.id}/accept`, {}, session.token);
                setRequests((current) => current.filter((item) => item.id !== row.id));
              }}
            />
            <Pressable
              style={styles.chip}
              onPress={async () => {
                await apiPost(`/student/social/follow-requests/${row.id}/reject`, {}, session.token);
                setRequests((current) => current.filter((item) => item.id !== row.id));
              }}
            >
              <Text style={styles.chipText}>Recusar</Text>
            </Pressable>
          </View>
        </View>
      ))}
    </StudentPage>
  );
}

function createStyles(st: StudentTokens) {
  return StyleSheet.create({
    back: { color: st.goldUi, fontWeight: "800", marginBottom: 8 },
    title: { color: st.text, fontWeight: "800", fontSize: 22, marginBottom: 12 },
    card: { borderWidth: 1, borderColor: st.line, backgroundColor: st.card, borderRadius: 16, padding: 14, gap: 8, marginBottom: 10 },
    name: { color: st.text, fontWeight: "800" },
    meta: { color: st.muted, fontSize: 13 },
    input: { borderWidth: 1, borderColor: st.line, borderRadius: 12, padding: 10, color: st.text, backgroundColor: st.inputBg, marginBottom: 10 },
    chip: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: st.line, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 8, alignSelf: "flex-start" },
    chipText: { color: st.text, fontWeight: "800", fontSize: 12 },
    row: { flexDirection: "row", gap: 8, flexWrap: "wrap" }
  });
}
