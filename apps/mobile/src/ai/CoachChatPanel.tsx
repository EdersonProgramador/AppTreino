import { useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { NativeApiError } from "../auth/api";
import { postCoachChat, fetchCoachStatus, transcribeCoachAudio } from "./coachApi";
import { speakCoach, startCoachRecording, stopCoachRecording, stopCoachVoice } from "./coachVoice";
import { fetchWeatherHere } from "../student/weather";
import { useSt, type StudentTokens } from "../student/theme";
import { uiSounds } from "../student/uiSounds";

type ChatMsg = { role: "coach" | "me"; text: string };

const SUGGESTIONS = [
  "Tô sem tempo hoje, o que dá pra fazer?",
  "Monta um treino pra mim agora",
  "Como eu como nessa semana?"
];

function renderMarkdown(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <Text key={index} style={{ fontWeight: "800" }}>
        {part.slice(2, -2)}
      </Text>
    ) : (
      <Text key={index}>{part}</Text>
    )
  );
}

export function CoachChatPanel({
  token,
  athleteName,
  onPlanSaved
}: {
  token: string;
  athleteName?: string | null;
  onPlanSaved?: () => void | Promise<void>;
}) {
  const { st } = useSt();
  const firstName = athleteName?.split(" ")[0] ?? "atleta";
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [engineLabel, setEngineLabel] = useState("Especialista em treino e nutrição");
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      role: "coach",
      text: `E aí, ${firstName}. Me conta o que tá acontecendo hoje no treino ou na rotina — eu respondo em cima da sua pergunta.`
    }
  ]);
  const recordingRef = useRef<Awaited<ReturnType<typeof startCoachRecording>> | null>(null);
  const startedAtRef = useRef(0);
  const logRef = useRef<ScrollView>(null);
  const styles = useMemo(() => createStyles(st), [st]);

  useEffect(() => {
    const timer = setTimeout(() => logRef.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(timer);
  }, [messages, busy, listening]);

  useEffect(() => {
    let cancelled = false;
    void fetchCoachStatus(token)
      .then((status) => {
        if (!cancelled && status.label) setEngineLabel(status.label);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function askCoach(text: string, speak = false) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setDraft("");
    const history = [...messages, { role: "me" as const, text: trimmed }];
    setMessages(history);
    setBusy(true);
    try {
      const weather = await fetchWeatherHere("WORKOUT");
      const payload = await postCoachChat(
        {
          messages: history.map((item) => ({
            role: item.role === "me" ? "user" : "assistant",
            content: item.text
          })),
          weather: weather
            ? { tempC: weather.tempC, label: weather.label, code: weather.code }
            : undefined
        },
        token
      );
      setMessages((current) => [...current, { role: "coach", text: payload.reply }]);
      if (payload.savedPlanId) await onPlanSaved?.();
      if (speak) void speakCoach(payload.reply);
      uiSounds.success();
    } catch {
      setMessages((current) => [
        ...current,
        { role: "coach", text: "Não consegui responder agora. Tente de novo em instantes." }
      ]);
      uiSounds.error();
    } finally {
      setBusy(false);
    }
  }

  async function talk() {
    stopCoachVoice();
    try {
      if (listening && recordingRef.current) {
        const uri = await stopCoachRecording(recordingRef.current);
        recordingRef.current = null;
        setListening(false);
        if (!uri) throw new Error("Não gravei o áudio.");
        if (Date.now() - startedAtRef.current < 700) {
          throw new Error("Áudio muito curto. Segure o microfone, fale e toque de novo para enviar.");
        }
        setBusy(true);
        const transcribed = await transcribeCoachAudio(uri, token);
        setBusy(false);
        if (!transcribed.text?.trim()) throw new Error("Não entendi o áudio.");
        await askCoach(transcribed.text, true);
        return;
      }
      recordingRef.current = await startCoachRecording();
      startedAtRef.current = Date.now();
      setListening(true);
      uiSounds.submit();
    } catch (caught) {
      recordingRef.current = null;
      setListening(false);
      setBusy(false);
      setMessages((current) => [
        ...current,
        {
          role: "coach",
          text:
            caught instanceof NativeApiError
              ? caught.message
              : caught instanceof Error
                ? caught.message
                : "Não deu para transcrever. Escreva no chat — a resposta ainda pode ser falada."
        }
      ]);
      uiSounds.error();
    }
  }

  const showHints = messages.length <= 1 && !busy;

  return (
    <KeyboardAvoidingView style={styles.wrap} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.top}>
        <View style={styles.brand}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>AT</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.brandTitle}>Coach AppTreino</Text>
            <Text style={styles.brandSub}>{engineLabel}</Text>
          </View>
        </View>
        <Pressable onPress={() => stopCoachVoice()} hitSlop={10} style={styles.iconBtn}>
          <Ionicons name="volume-medium-outline" size={20} color={st.text} />
        </Pressable>
      </View>
      <ScrollView
        ref={logRef}
        style={styles.thread}
        contentContainerStyle={styles.threadContent}
        keyboardShouldPersistTaps="handled"
      >
        {messages.map((item, index) => (
          <View key={`${item.role}-${index}`} style={[styles.row, item.role === "me" ? styles.rowMe : null]}>
            <View style={[styles.avatarSm, item.role === "me" ? styles.avatarUser : null]}>
              <Text style={[styles.avatarText, item.role === "me" && { color: st.text }]}>
                {item.role === "me" ? firstName.slice(0, 1).toUpperCase() : "AT"}
              </Text>
            </View>
            <View style={[styles.bubble, item.role === "me" ? styles.bubbleMe : styles.bubbleCoach]}>
              <Text style={[styles.bubbleText, item.role === "me" ? styles.bubbleTextMe : null]}>
                {renderMarkdown(item.text)}
              </Text>
            </View>
          </View>
        ))}
        {listening ? <Text style={styles.status}>Ouvindo… toque no microfone de novo para enviar.</Text> : null}
        {busy && !listening ? <Text style={styles.status}>Coach pensando…</Text> : null}
        {showHints ? (
          <View style={styles.hints}>
            {SUGGESTIONS.map((item) => (
              <Pressable key={item} onPress={() => void askCoach(item)} style={styles.hint}>
                <Text style={styles.hintText}>{item}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </ScrollView>
      <View style={styles.dock}>
        <Pressable
          onPress={() => void talk()}
          disabled={busy && !listening}
          style={[styles.iconBtn, listening ? styles.live : null]}
        >
          <Ionicons name={listening ? "stop" : "mic"} size={18} color={listening ? "#fff" : st.text} />
        </Pressable>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Mensagem para o Coach…"
          placeholderTextColor={st.faint}
          style={styles.input}
          multiline
          editable={!busy}
        />
        <Pressable
          onPress={() => void askCoach(draft)}
          disabled={busy || !draft.trim()}
          style={[styles.send, (!draft.trim() || busy) && { opacity: 0.35 }]}
        >
          <Ionicons name="arrow-up" size={18} color="#15100b" />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function createStyles(st: StudentTokens) {
  return StyleSheet.create({
    wrap: {
      flex: 1,
      marginHorizontal: 12,
      marginBottom: 8,
      borderRadius: 22,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: st.line,
      backgroundColor: st.panelBg
    },
    top: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: st.line
    },
    brand: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
    brandTitle: { color: st.text, fontSize: 15, fontWeight: "800" },
    brandSub: { color: st.muted, fontSize: 12, marginTop: 1 },
    avatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: "#df663c",
      alignItems: "center",
      justifyContent: "center"
    },
    avatarSm: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: "#df663c",
      alignItems: "center",
      justifyContent: "center",
      marginTop: 2
    },
    avatarUser: { backgroundColor: st.fill },
    avatarText: { color: "#15100b", fontSize: 10, fontWeight: "800" },
    thread: { flex: 1 },
    threadContent: { padding: 14, gap: 14, paddingBottom: 20 },
    row: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
    rowMe: { flexDirection: "row-reverse" },
    bubble: { maxWidth: "78%", borderRadius: 16, paddingHorizontal: 12, paddingVertical: 10 },
    bubbleCoach: { backgroundColor: st.fill, borderTopLeftRadius: 4 },
    bubbleMe: { backgroundColor: "#df663c", borderTopRightRadius: 4 },
    bubbleText: { color: st.text, fontSize: 15, lineHeight: 22 },
    bubbleTextMe: { color: "#15100b" },
    status: { color: st.faint, fontSize: 12 },
    hints: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    hint: {
      borderWidth: 1,
      borderColor: st.line,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: st.fill
    },
    hintText: { color: st.text, fontSize: 13, fontWeight: "600" },
    dock: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 8,
      margin: 10,
      paddingHorizontal: 8,
      paddingVertical: 6,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: st.line,
      backgroundColor: st.inputBg
    },
    input: {
      flex: 1,
      minHeight: 36,
      maxHeight: 120,
      color: st.text,
      fontSize: 15,
      paddingVertical: 8
    },
    iconBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: "center",
      justifyContent: "center"
    },
    live: { backgroundColor: "#c73d2e" },
    send: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#d4af37"
    }
  });
}
