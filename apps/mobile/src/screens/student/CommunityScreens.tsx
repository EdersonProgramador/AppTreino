import { useEffect, useState } from "react";
import { Alert, Image, Pressable, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CompositeNavigationProp, useNavigation } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { apiPost, NativeApiError } from "../../auth/api";
import { mediaUrl } from "../../lib/media";
import type { MenuStackParamList, StudentTabParamList } from "../../navigation/types";
import { labelLocationType, labelTicketCategory, labelTicketStatus } from "../../student/commerce";
import { trainingCopy } from "../../student/copy";
import { BackChip, EmptyState, GreenButton, OutlineButton, SheetHeading, StudentPage } from "../../student/layout";
import { useMenuStyles } from "../../student/menuStyles";
import { useStudent } from "../../student/StudentContext";
import { moduleOn, useSt } from "../../student/theme";
import { uiSounds } from "../../student/uiSounds";
import { formatDateTime } from "../../theme";

const TICKET_CATEGORIES = [
  { value: "GENERAL", label: "Geral" },
  { value: "WORKOUT", label: "Treino" },
  { value: "PAYMENT", label: "Pagamento" },
  { value: "TECHNICAL", label: "Técnico" }
] as const;

export function EventsScreen() {
  const { events, session, refresh } = useStudent();
  const navigation = useNavigation();
  const styles = useMenuStyles();
  async function register(id: string) {
    try {
      await apiPost("/user/events/register", { eventId: id }, session.token);
      await refresh();
      uiSounds.success();
    } catch (caught) {
      Alert.alert("Eventos", caught instanceof NativeApiError ? caught.message : "Não foi possível inscrever.");
      uiSounds.error();
    }
  }
  return (
    <StudentPage>
      <BackChip label="Menu" onPress={() => navigation.goBack()} />
      <SheetHeading kicker="Eventos" title="Agenda da academia" subtitle={`${events.length} evento(s) disponíveis`} />
      {events.length === 0 ? (
        <EmptyState icon="calendar-outline" title="Nenhum evento" text="Nenhum evento no momento." />
      ) : (
        events.map((item) => (
          <View key={item.id} style={styles.card}>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.muted}>{`${formatDateTime(item.startsAt)} • ${item.location ?? "Online"}`}</Text>
            {item.description ? <Text style={styles.faint}>{item.description}</Text> : null}
            {item.capacity ? (
              <Text style={styles.faint}>{`${item.registrationCount ?? 0}/${item.capacity} vagas`}</Text>
            ) : null}
            <GreenButton
              label={item.registered ? "Inscrito" : "Entrar"}
              disabled={item.registered}
              onPress={() => void register(item.id)}
            />
          </View>
        ))
      )}
    </StudentPage>
  );
}

export function LocationsScreen() {
  const { locations } = useStudent();
  const navigation = useNavigation();
  const { st } = useSt();
  const styles = useMenuStyles();
  return (
    <StudentPage>
      <BackChip label="Menu" onPress={() => navigation.goBack()} />
      <SheetHeading
        kicker="Unidades"
        title="Academias, boxes e studios"
        subtitle={`${locations.length} localidade(s) disponível(is)`}
      />
      {locations.length === 0 ? (
        <EmptyState icon="location-outline" title="Nenhuma localidade publicada" text="As unidades e clubes cadastrados aparecerão aqui." />
      ) : (
        locations.map((item) => {
          const image = mediaUrl(item.imageUrl);
          return (
            <View key={item.id} style={styles.card}>
              <View style={styles.row}>
                {image ? (
                  <Image source={{ uri: image }} style={styles.thumb} />
                ) : (
                  <Ionicons name="business-outline" size={22} color={st.gold} />
                )}
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={styles.title}>{item.name}</Text>
                  <Text style={styles.muted}>
                    {labelLocationType(item.type)}
                    {item.address ? ` • ${item.address}` : ""}
                  </Text>
                  <Text style={styles.muted}>
                    {[item.city, item.state].filter(Boolean).join(" - ")}
                    {item.phone ? ` • ${item.phone}` : ""}
                  </Text>
                  {item.description ? <Text style={styles.faint}>{item.description}</Text> : null}
                </View>
              </View>
            </View>
          );
        })
      )}
    </StudentPage>
  );
}

export function SupportScreen() {
  const { tickets, session, refresh } = useStudent();
  const navigation = useNavigation();
  const { st } = useSt();
  const styles = useMenuStyles();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<(typeof TICKET_CATEGORIES)[number]["value"]>("GENERAL");
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(tickets[0]?.id ?? null);
  const selected = tickets.find((item) => item.id === selectedId) ?? tickets[0] ?? null;

  async function createTicket() {
    if (subject.trim().length < 3 || body.trim().length < 8) {
      Alert.alert("Atendimento", "Preencha assunto e mensagem.");
      uiSounds.error();
      return;
    }
    setBusy(true);
    try {
      await apiPost(
        "/user/support-tickets",
        { subject: subject.trim(), message: body.trim(), category },
        session.token
      );
      setSubject("");
      setBody("");
      await refresh();
      uiSounds.submit();
    } catch (caught) {
      Alert.alert("Atendimento", caught instanceof NativeApiError ? caught.message : "Não foi possível enviar.");
      uiSounds.error();
    } finally {
      setBusy(false);
    }
  }

  async function sendReply() {
    if (!selected || !reply.trim()) return;
    setBusy(true);
    try {
      await apiPost(`/user/support-tickets/${selected.id}/messages`, { body: reply.trim() }, session.token);
      setReply("");
      await refresh();
      uiSounds.submit();
    } catch (caught) {
      Alert.alert("Atendimento", caught instanceof NativeApiError ? caught.message : "Não foi possível enviar.");
      uiSounds.error();
    } finally {
      setBusy(false);
    }
  }

  async function closeTicket() {
    if (!selected) return;
    setBusy(true);
    try {
      await apiPost(`/user/support-tickets/${selected.id}/close`, {}, session.token);
      await refresh();
      uiSounds.toggleOff();
    } catch (caught) {
      Alert.alert("Atendimento", caught instanceof NativeApiError ? caught.message : "Não foi possível encerrar.");
      uiSounds.error();
    } finally {
      setBusy(false);
    }
  }

  const closed = selected?.status === "CLOSED" || selected?.status === "RESOLVED";

  useEffect(() => {
    const timer = setInterval(() => {
      void refresh();
    }, 8000);
    return () => clearInterval(timer);
  }, [refresh]);

  return (
    <StudentPage>
      <BackChip label="Menu" onPress={() => navigation.goBack()} />
      <SheetHeading kicker="Central de ajuda" title="Atendimento" subtitle={`${tickets.length} chamado(s)`} />
      {tickets.length > 0 && selected ? (
        <>
          {tickets.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => setSelectedId(item.id)}
              style={[styles.card, selected.id === item.id && { borderColor: st.gold }]}
            >
              <Text style={styles.title}>{item.subject}</Text>
              <Text style={styles.muted}>{`${labelTicketCategory(item.category)} · ${labelTicketStatus(item.status)}`}</Text>
            </Pressable>
          ))}
          <View style={styles.card}>
            <Text style={styles.title}>{selected.subject}</Text>
            <Text style={styles.badge}>{labelTicketStatus(selected.status)}</Text>
            {(selected.messages ?? []).map((message) => (
              <View key={message.id} style={[styles.card, message.senderType === "STUDENT" ? styles.chatMe : styles.chatThem, { marginHorizontal: 0 }]}>
                <Text style={styles.gold}>{message.senderType === "STUDENT" ? "Você" : "Equipe App Treino Social"}</Text>
                <Text style={styles.muted}>{message.body}</Text>
                <Text style={styles.faint}>{formatDateTime(message.createdAt)}</Text>
              </View>
            ))}
            {!closed ? (
              <>
                {selected.status === "WAITING_STUDENT" ? (
                  <Text style={styles.muted}>
                    A equipe perguntou se há algo a mais em que podemos ajudar. Responda para continuar a conversa ou finalize o atendimento.
                  </Text>
                ) : null}
                <TextInput
                  value={reply}
                  onChangeText={setReply}
                  placeholder="Digite uma mensagem"
                  placeholderTextColor={st.faint}
                  multiline
                  style={[styles.input, { minHeight: 80 }]}
                />
                <GreenButton label="Enviar" loading={busy} onPress={() => void sendReply()} />
                <OutlineButton label="Encerrar atendimento" onPress={() => void closeTicket()} />
              </>
            ) : (
              <Text style={styles.muted}>Atendimento encerrado.</Text>
            )}
          </View>
        </>
      ) : (
        <EmptyState icon="chatbubble-ellipses-outline" title="Nenhum chamado aberto" text="Envie sua dúvida abaixo para falar com a equipe." />
      )}
      <View style={styles.card}>
        <Text style={styles.gold}>Abrir atendimento</Text>
        <TextInput value={subject} onChangeText={setSubject} placeholder="Assunto" placeholderTextColor={st.faint} style={styles.input} />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {TICKET_CATEGORIES.map((item) => (
            <Pressable
              key={item.value}
              onPress={() => setCategory(item.value)}
              style={[styles.badge, category === item.value && { backgroundColor: st.coral }]}
            >
              <Text style={{ color: category === item.value ? "#fff" : st.goldUi, fontWeight: "800", fontSize: 12 }}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          value={body}
          onChangeText={setBody}
          placeholder="Descreva o que você precisa"
          placeholderTextColor={st.faint}
          multiline
          style={[styles.input, { minHeight: 90 }]}
        />
        <GreenButton label="Abrir atendimento" loading={busy} onPress={() => void createTicket()} />
      </View>
    </StudentPage>
  );
}

export function RatingsScreen() {
  const { programs, favorites, session, refresh } = useStudent();
  const navigation = useNavigation();
  const { st } = useSt();
  const styles = useMenuStyles();
  const [draft, setDraft] = useState<Record<string, { score: number; comment: string }>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  async function toggleFavorite(programId: string) {
    setBusyId(programId);
    try {
      await apiPost(`/student/workout/favorites/${programId}`, {}, session.token);
      await refresh();
      uiSounds.itemDeselect();
    } catch (caught) {
      Alert.alert("Favoritos", caught instanceof NativeApiError ? caught.message : "Não foi possível atualizar.");
      uiSounds.error();
    } finally {
      setBusyId(null);
    }
  }

  async function submit(programId: string, assignmentId: string) {
    const current = draft[programId];
    if (!current || current.score < 1) return;
    setBusyId(programId);
    try {
      await apiPost(
        "/student/ratings",
        { score: current.score, comment: current.comment || undefined, targetType: "WORKOUT", targetId: assignmentId },
        session.token
      );
      if (!programs.find((item) => item.programId === programId)?.favoritedByMe) {
        try {
          await apiPost(`/student/workout/favorites/${programId}`, {}, session.token);
        } catch {
          // ignore
        }
      }
      await refresh();
      setDraft((value) => {
        const next = { ...value };
        delete next[programId];
        return next;
      });
      uiSounds.success();
    } catch (caught) {
      Alert.alert("Avaliação", caught instanceof NativeApiError ? caught.message : "Não foi possível avaliar.");
      uiSounds.error();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <StudentPage>
      <BackChip label="Menu" onPress={() => navigation.goBack()} />
      <SheetHeading
        kicker="Engajamento"
        title={trainingCopy.favoritesAndRatings}
        subtitle={`${favorites.length} favorito(s) · ${programs.length} treino(s) para avaliar`}
      />
      <SheetHeading kicker="" title="Favoritos" />
      {favorites.length === 0 ? (
        <EmptyState icon="star-outline" title="Nenhum favorito ainda" text="Ao avaliar um treino, ele também pode ser salvo aqui automaticamente." />
      ) : (
        favorites.map((favorite) => {
          const cover = mediaUrl(favorite.program.modalityImageUrl);
          return (
            <View key={favorite.id} style={styles.card}>
              <View style={styles.row}>
                {cover ? <Image source={{ uri: cover }} style={styles.thumb} /> : <Ionicons name="barbell-outline" size={24} color={st.gold} />}
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>{favorite.program.title}</Text>
                  <Text style={styles.muted}>
                    {`${favorite.program.modality ?? "Hipertrofia"} • ${favorite.program.totalWorkouts ?? 0} treinos`}
                  </Text>
                </View>
              </View>
              <OutlineButton
                label={busyId === favorite.program.id ? "Removendo..." : "Remover"}
                icon="trash-outline"
                disabled={busyId === favorite.program.id}
                onPress={() => void toggleFavorite(favorite.program.id)}
              />
            </View>
          );
        })
      )}
      <SheetHeading kicker="" title={trainingCopy.rateWorkout} />
      {programs.length === 0 ? (
        <EmptyState icon="trophy-outline" title="Nenhum treino para avaliar" text="Os treinos publicados aparecerão aqui para você avaliar." />
      ) : (
        programs.map((program) => {
          const current = draft[program.programId];
          return (
            <View key={program.programId} style={styles.card}>
              <Text style={styles.title}>{program.programTitle}</Text>
              <Text style={styles.muted}>{program.modality ?? "Hipertrofia"}</Text>
              {program.ratedByMe ? (
                <Text style={styles.badge}>Avaliado</Text>
              ) : (
                <>
                  <View style={styles.starRow}>
                    {[1, 2, 3, 4, 5].map((score) => (
                      <Pressable
                        key={score}
                        onPress={() =>
                          setDraft((value) => ({
                            ...value,
                            [program.programId]: { score, comment: value[program.programId]?.comment ?? "" }
                          }))
                        }
                      >
                        <Ionicons
                          name={current && score <= current.score ? "star" : "star-outline"}
                          size={22}
                          color={st.gold}
                        />
                      </Pressable>
                    ))}
                  </View>
                  <TextInput
                    value={current?.comment ?? ""}
                    onChangeText={(comment) =>
                      setDraft((value) => ({
                        ...value,
                        [program.programId]: { score: value[program.programId]?.score ?? 0, comment }
                      }))
                    }
                    placeholder="Comentário (opcional)"
                    placeholderTextColor={st.faint}
                    style={styles.input}
                  />
                  <GreenButton
                    label={busyId === program.programId ? "Enviando..." : "Enviar avaliação"}
                    disabled={!current || current.score < 1}
                    loading={busyId === program.programId}
                    onPress={() => void submit(program.programId, program.assignmentId)}
                  />
                </>
              )}
            </View>
          );
        })
      )}
    </StudentPage>
  );
}

export function QrScreen() {
  const { publicConfig, refresh } = useStudent();
  const styles = useMenuStyles();
  const navigation = useNavigation<
    CompositeNavigationProp<NativeStackNavigationProp<MenuStackParamList>, BottomTabNavigationProp<StudentTabParamList>>
  >();
  const qrEnabled = moduleOn(publicConfig, "module_qr") && publicConfig.qr_checkin_enabled !== "false";
  const qrUrl = publicConfig.qr_checkin_url || "https://edersonprogramador.com/checkin";
  const qrImage = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(qrUrl)}`;

  return (
    <StudentPage>
      <BackChip label="Menu" onPress={() => navigation.goBack()} />
      <SheetHeading kicker="Check-in" title="QR Code" subtitle="Mostre este código na recepção para registrar sua presença." />
      {!qrEnabled ? (
        <EmptyState icon="qr-code-outline" title="QR indisponível" text="A academia desativou o check-in por QR no momento." />
      ) : (
        <View style={[styles.card, { alignItems: "center" }]}>
          <Image source={{ uri: qrImage }} style={{ width: 220, height: 220 }} />
          <Text style={styles.muted}>Mostre este código na recepção para registrar sua presença.</Text>
          <GreenButton
            label="Confirmar check-in"
            onPress={() => {
              uiSounds.submit();
              void refresh();
              navigation.navigate("Status");
            }}
          />
        </View>
      )}
    </StudentPage>
  );
}

export function AiScreen() {
  const { aiPlans, profile, session, refresh } = useStudent();
  const navigation = useNavigation();
  const { st } = useSt();
  const styles = useMenuStyles();
  const [objective, setObjective] = useState(profile?.objective ?? "");
  const [level, setLevel] = useState(profile?.level ?? "");
  const [focus, setFocus] = useState("");
  const [days, setDays] = useState("3");
  const [busy, setBusy] = useState(false);
  const latest = aiPlans[0];

  async function generate() {
    setBusy(true);
    try {
      await apiPost(
        "/user/ai-workout-plans",
        { objective: objective.trim() || "condicionamento", level: level.trim() || "iniciante", daysPerWeek: Number(days), focus: focus.trim() || undefined },
        session.token
      );
      await refresh();
      uiSounds.success();
    } catch (caught) {
      Alert.alert("IA", caught instanceof NativeApiError ? caught.message : "Não foi possível gerar o plano pelo agente IA.");
      uiSounds.error();
    } finally {
      setBusy(false);
    }
  }

  return (
    <StudentPage>
      <BackChip label="Menu" onPress={() => navigation.goBack()} />
      <SheetHeading kicker="Agente IA" title="Plano inteligente" subtitle="Gere uma rotina baseada no seu objetivo." />
      <View style={styles.card}>
        <TextInput value={objective} onChangeText={setObjective} placeholder="Objetivo" placeholderTextColor={st.faint} style={styles.input} />
        <TextInput value={level} onChangeText={setLevel} placeholder="Nível" placeholderTextColor={st.faint} style={styles.input} />
        <TextInput value={focus} onChangeText={setFocus} placeholder="Foco da semana" placeholderTextColor={st.faint} style={styles.input} />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {["2", "3", "4", "5", "6"].map((item) => (
            <Pressable key={item} onPress={() => setDays(item)} style={[styles.badge, days === item && { backgroundColor: st.coral }]}>
              <Text style={{ color: days === item ? "#fff" : st.goldUi, fontWeight: "800" }}>{item} dias</Text>
            </Pressable>
          ))}
        </View>
        <GreenButton label={busy ? "Gerando…" : "Gerar plano"} loading={busy} onPress={() => void generate()} />
      </View>
      {latest ? (
        <View style={styles.card}>
          <Text style={styles.title}>Último plano</Text>
          <Text style={styles.muted}>{latest.plan?.summary ?? `${latest.objective} · ${latest.level} · ${latest.daysPerWeek}x`}</Text>
          <Text style={styles.faint}>{`${latest.objective} · ${latest.level} · ${latest.daysPerWeek}x`}</Text>
          {(latest.plan?.days ?? []).map((day) => (
            <View key={day.title} style={{ gap: 4 }}>
              <Text style={styles.gold}>{day.title}</Text>
              <Text style={styles.muted}>{day.focus}</Text>
              {day.exercises.map((exercise) => (
                <Text key={exercise.name} style={styles.faint}>{`${exercise.name} · ${exercise.sets}x ${exercise.reps}`}</Text>
              ))}
            </View>
          ))}
          {(latest.plan?.recommendations ?? []).length > 0 ? (
            <View style={{ gap: 4, marginTop: 8 }}>
              <Text style={styles.gold}>Recomendações</Text>
              {(latest.plan?.recommendations ?? []).map((item) => (
                <Text key={item} style={styles.muted}>{item}</Text>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </StudentPage>
  );
}

