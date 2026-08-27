import { useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { Alert, Pressable, Share, StyleSheet, Text, View, type ImageStyle, type StyleProp } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CompositeNavigationProp, useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { apiPost, NativeApiError } from "../../auth/api";
import { MediaImage } from "../../lib/MediaImage";
import type { StudentTabParamList, TrainingStackParamList } from "../../navigation/types";
import { sessionLabelFromBlock, trainingCopy } from "../../student/copy";
import {
  BackChip,
  CardIcon,
  CompletedSeal,
  EmptyState,
  GreenButton,
  OutlineButton,
  ProgressTrack,
  SheetHeading,
  StudentPage
} from "../../student/layout";
import { FALLBACK_WORKOUT_MODALITY } from "../../student/navigate";
import { useStudent } from "../../student/StudentContext";
import { TodayWorkoutHero } from "../../student/TodayWorkoutHero";
import { tabBarStyleFor, useSt, type StudentTokens } from "../../student/theme";
import { uiSounds } from "../../student/uiSounds";
import type { WorkoutProgram } from "../../types";
import { NativeWorkoutPlayer } from "../../workout/NativeWorkoutPlayer";
import { previewMediaUrl } from "../../workout/helpers";

function Cover({
  uri,
  style,
  fallback
}: {
  uri?: string | null;
  style: StyleProp<ImageStyle>;
  fallback?: ReactNode;
}) {
  return <MediaImage uri={uri} style={style} fallback={fallback} />;
}

function modalityName(program: { modality?: string | null }) {
  return program.modality?.trim() || FALLBACK_WORKOUT_MODALITY;
}

function workoutCover(program: { modalityImageUrl?: string | null }, fallback?: string | null) {
  return program.modalityImageUrl || fallback || null;
}

function dayCover(day: { block: { exercises: Array<{ videoUrl?: string }> } }, programCover?: string | null) {
  const fromExercise = day.block.exercises.map((exercise) => previewMediaUrl(exercise.videoUrl)).find(Boolean);
  return programCover || fromExercise || null;
}

function useTrainingStyles() {
  const { st } = useSt();
  return useMemo(() => createTrainingStyles(st), [st]);
}

function useModalityCovers() {
  const { programs, modalities: catalogModalities } = useStudent();
  return useMemo(() => {
    const map = new Map<string, string | null>();
    for (const item of catalogModalities) {
      if (item.imageUrl) {
        map.set(item.name, item.imageUrl);
        map.set(item.name.toLowerCase(), item.imageUrl);
      }
    }
    for (const program of programs) {
      const name = modalityName(program);
      if (!map.get(name) && program.modalityImageUrl) map.set(name, program.modalityImageUrl);
    }
    return map;
  }, [catalogModalities, programs]);
}

export function TrainingCatalogScreen() {
  const { programs } = useStudent();
  const navigation = useNavigation<NativeStackNavigationProp<TrainingStackParamList>>();
  const { st } = useSt();
  const styles = useTrainingStyles();
  const coverByModality = useModalityCovers();

  const modalities = useMemo(() => {
    const map = new Map<string, { count: number; imageUrl?: string | null }>();
    for (const program of programs) {
      const name = modalityName(program);
      const current = map.get(name);
      map.set(name, {
        count: (current?.count ?? 0) + 1,
        imageUrl: current?.imageUrl ?? program.modalityImageUrl ?? coverByModality.get(name) ?? coverByModality.get(name.toLowerCase())
      });
    }
    return [...map.entries()].map(([name, value]) => ({ name, ...value }));
  }, [coverByModality, programs]);

  return (
    <StudentPage>
      <TodayWorkoutHero />
      <SheetHeading
        kicker={trainingCopy.workout}
        title={trainingCopy.modalities}
        subtitle={modalities.length > 0 ? trainingCopy.pickModality : trainingCopy.noWorkoutsHint}
      />
      {modalities.length === 0 ? (
        <EmptyState icon="barbell-outline" title={trainingCopy.noWorkouts} text={trainingCopy.noWorkoutsHint} />
      ) : (
        <View style={styles.list}>
          {modalities.map((item) => (
            <Pressable
              key={item.name}
              style={styles.modality}
              onPress={() => {
                uiSounds.itemSelect();
                navigation.navigate("Workouts", { modality: item.name });
              }}
            >
              <View style={styles.modalityMedia}>
                {item.imageUrl ? (
                  <Cover
                    uri={item.imageUrl}
                    style={styles.mediaFill}
                    fallback={
                      <View style={styles.modalityFallback}>
                        <Ionicons name="barbell-outline" size={26} color={st.gold} />
                      </View>
                    }
                  />
                ) : (
                  <View style={styles.modalityFallback}>
                    <Ionicons name="barbell-outline" size={26} color={st.gold} />
                  </View>
                )}
              </View>
              <View style={styles.modalityCopy}>
                <Text style={styles.modalityTitle}>{item.name}</Text>
                <Text style={styles.modalitySub}>{trainingCopy.workoutsCount(item.count)}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </StudentPage>
  );
}

export function TrainingWorkoutsScreen() {
  const { programs, session, refresh } = useStudent();
  const navigation = useNavigation<NativeStackNavigationProp<TrainingStackParamList>>();
  const route = useRoute<RouteProp<TrainingStackParamList, "Workouts">>();
  const styles = useTrainingStyles();
  const coverByModality = useModalityCovers();
  const [repeatingId, setRepeatingId] = useState<string | null>(null);
  const modality = route.params.modality;
  const list = programs.filter((item) => modalityName(item) === modality);
  const todayId = programs[0]?.programId;

  async function repeat(assignmentId: string, programId: string) {
    setRepeatingId(programId);
    try {
      await apiPost("/student/workout/repeat", { assignmentId }, session.token);
      await refresh();
      uiSounds.open();
      navigation.navigate("Program", { programId });
    } catch (caught) {
      Alert.alert("Não foi possível repetir", caught instanceof NativeApiError ? caught.message : "Tente de novo.");
      uiSounds.error();
    } finally {
      setRepeatingId(null);
    }
  }

  return (
    <StudentPage>
      <BackChip
        label={trainingCopy.backToModalities}
        onPress={() => {
          uiSounds.pageChange();
          navigation.navigate("Training");
        }}
      />
      <SheetHeading kicker={modality} title={trainingCopy.modalityWorkoutsHeading} subtitle={trainingCopy.pickWorkout} />
      {list.length === 0 ? (
        <EmptyState icon="barbell-outline" title={trainingCopy.noWorkouts} text={trainingCopy.noWorkoutsHint} />
      ) : (
        <View style={styles.list}>
          {list.map((program) => {
            const done = program.completedWorkouts ?? 0;
            const total = program.totalWorkouts ?? program.totalDays;
            const cycleCompleted = Boolean(program.cycleCompleted);
            const completionCount = program.completionCount ?? 0;
            const showSeal = cycleCompleted || completionCount > 0;
            const isToday = todayId === program.programId;
            const focus = program.block?.focus || program.sequence?.[0]?.block.focus || trainingCopy.sessionFocusFallback;
            const cover = workoutCover(program, coverByModality.get(modality) ?? coverByModality.get(modality.toLowerCase()));
            return (
              <View
                key={program.programId}
                style={[styles.trainingCard, isToday && styles.programActive, cycleCompleted && styles.programDone]}
              >
                {showSeal ? (
                  <CompletedSeal
                    label={`${trainingCopy.completedBadge}${completionCount > 1 ? ` · ${completionCount}x` : ""}`}
                  />
                ) : null}
                <View style={styles.cardRow}>
                  {cover ? (
                    <Cover uri={cover} style={styles.thumb} fallback={<CardIcon />} />
                  ) : (
                    <CardIcon />
                  )}
                  <Pressable
                    style={styles.cardBody}
                    onPress={() => {
                      uiSounds.itemSelect();
                      navigation.navigate("Program", { programId: program.programId });
                    }}
                  >
                    <Text style={styles.programTitle}>{program.programTitle}</Text>
                    <Text style={styles.programSub}>
                      {focus} · {trainingCopy.sessionsDone(done, total)}
                      {cycleCompleted
                        ? ` · ${trainingCopy.completedBadge}`
                        : completionCount > 0
                          ? ` · ${trainingCopy.completedBadge}${completionCount > 1 ? ` ${completionCount}x` : ""}`
                          : isToday
                            ? ` · ${trainingCopy.todayWorkout}`
                            : ""}
                    </Text>
                  </Pressable>
                </View>
                <GreenButton
                  label={
                    repeatingId === program.programId
                      ? "Abrindo..."
                      : cycleCompleted
                        ? trainingCopy.repeatWorkout
                        : trainingCopy.openWorkout
                  }
                  loading={repeatingId === program.programId}
                  onPress={() => {
                    if (cycleCompleted) {
                      void repeat(program.assignmentId, program.programId);
                      return;
                    }
                    uiSounds.open();
                    navigation.navigate("Program", { programId: program.programId });
                  }}
                />
              </View>
            );
          })}
        </View>
      )}
    </StudentPage>
  );
}

function formatStudentDate(value?: string | null) {
  if (!value) return "Não informado";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Não informado";
  return date.toLocaleDateString("pt-BR");
}

function formatProgramDuration(duration?: WorkoutProgram["duration"]) {
  if (!duration) return "Duração não informada";
  const parts = [
    duration.years ? `${duration.years} ano(s)` : "",
    duration.months ? `${duration.months} mês(es)` : "",
    duration.weeks ? `${duration.weeks} semana(s)` : "",
    duration.days ? `${duration.days} dia(s)` : ""
  ].filter(Boolean);
  return parts.join(", ") || (duration.estimatedCalendarDays ? `${duration.estimatedCalendarDays} dia(s)` : "Duração não informada");
}

type ProgramNav = CompositeNavigationProp<
  NativeStackNavigationProp<TrainingStackParamList, "Program">,
  BottomTabNavigationProp<StudentTabParamList>
>;

export function ProgramScreen() {
  const { programs, membership, session, refresh } = useStudent();
  const navigation = useNavigation<ProgramNav>();
  const { st } = useSt();
  const styles = useTrainingStyles();
  const route = useRoute<RouteProp<TrainingStackParamList, "Program">>();
  const coverByModality = useModalityCovers();
  const program = programs.find((item) => item.programId === route.params.programId);
  const [busy, setBusy] = useState(false);
  const [rating, setRating] = useState(0);

  if (!program) {
    return (
      <StudentPage>
        <EmptyState icon="alert-circle-outline" title="Treino não encontrado" text="Volte e atualize a lista." />
      </StudentPage>
    );
  }

  const days = program.sequence?.length ? program.sequence : [program];
  const cycleCompleted = Boolean(program.cycleCompleted);
  const assignmentId = program.assignmentId;
  const programId = program.programId;
  const done = program.completedWorkouts ?? 0;
  const total = program.totalWorkouts ?? program.totalDays;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  const current = days.find((day) => day.dayNumber === program.dayNumber) ?? days[0];
  const programCover =
    program.modalityImageUrl ||
    coverByModality.get(modalityName(program)) ||
    coverByModality.get(modalityName(program).toLowerCase()) ||
    null;
  const membershipStartsAt = program.membershipStartsAt ?? membership?.startsAt ?? null;
  const membershipEndsAt = program.membershipEndsAt ?? membership?.endsAt ?? null;
  // Function declarations são hoisted e perdem o narrowing do `if (!program)` acima.
  const programModality = modalityName(program);

  async function repeat() {
    setBusy(true);
    try {
      await apiPost("/student/workout/repeat", { assignmentId }, session.token);
      await refresh();
    } catch (caught) {
      Alert.alert("Não foi possível repetir", caught instanceof NativeApiError ? caught.message : "Tente de novo.");
      uiSounds.error();
    } finally {
      setBusy(false);
    }
  }

  async function rate(score: number) {
    setRating(score);
    try {
      await apiPost(
        "/student/ratings",
        { score, targetType: "WORKOUT", targetId: assignmentId, programId },
        session.token
      );
      await refresh();
    } catch (caught) {
      Alert.alert("Avaliação", caught instanceof NativeApiError ? caught.message : "Não foi possível avaliar.");
    }
  }

  function backToWorkouts() {
    uiSounds.pageChange();
    navigation.reset({
      index: 1,
      routes: [
        { name: "Training" },
        { name: "Workouts", params: { modality: programModality } }
      ]
    });
  }

  return (
    <StudentPage>
      <View style={styles.sheetCard}>
        <Pressable onPress={backToWorkouts} style={styles.sheetBack}>
          <Ionicons name="chevron-back" size={18} color={st.goldUi} />
          <Text style={styles.sheetBackText}>{trainingCopy.backToWorkouts}</Text>
        </Pressable>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetKicker}>{trainingCopy.workout}</Text>
          <Text style={styles.sheetTitle}>{program.programTitle}</Text>
          <Text style={styles.sheetSubtitle}>{program.modality ?? trainingCopy.modality}</Text>
          {cycleCompleted ? (
            <View style={styles.inlineSeal}>
              <Ionicons name="trophy" size={12} color="#1a1208" />
              <Text style={styles.inlineSealText}>
                {trainingCopy.completedBadge}
                {(program.completionCount ?? 0) > 1 ? ` · ${program.completionCount}x` : ""}
              </Text>
            </View>
          ) : null}
          {cycleCompleted ? (
            <GreenButton label={busy ? "Abrindo..." : trainingCopy.repeatWorkout} loading={busy} onPress={() => void repeat()} />
          ) : null}
          {program.favoritedByMe ? (
            <View style={styles.favBadge}>
              <Ionicons name="star" size={15} color={st.gold} />
              <Text style={styles.favBadgeText}>Favoritado</Text>
            </View>
          ) : (
            <View style={styles.rateRow}>
              <Text style={styles.rateLabel}>{trainingCopy.rateWorkout}</Text>
              <View style={styles.stars}>
                {[1, 2, 3, 4, 5].map((score) => (
                  <Pressable
                    key={score}
                    onPress={() => {
                      uiSounds.radioSelect();
                      void rate(score);
                    }}
                  >
                    <Ionicons
                      name={score <= rating ? "star" : "star-outline"}
                      size={22}
                      color={score <= rating ? st.gold : "#6b6359"}
                    />
                  </Pressable>
                ))}
              </View>
            </View>
          )}
          <View style={styles.sheetIcon}>
            <Ionicons name="barbell" size={58} color="#df663c" />
          </View>
        </View>
        <View style={styles.meta}>
          <View style={styles.metaItem}>
            <Text style={styles.metaSmall}>{trainingCopy.todayWorkout}</Text>
            <Text style={styles.metaStrong}>
              {sessionLabelFromBlock(current?.block.identifier ?? current?.block.title ?? program.block.title)}
            </Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaSmall}>Foco</Text>
            <Text style={styles.metaStrong}>{current?.block.focus ?? program.block.focus ?? trainingCopy.sessionFocusFallback}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaSmall}>{trainingCopy.sessions}</Text>
            <View style={styles.metaValueRow}>
              <Text style={styles.metaStrong}>{trainingCopy.sessionsDone(done, total)}</Text>
              <Pressable
                onPress={() => {
                  uiSounds.itemSelect();
                  navigation.navigate("MenuTab", { screen: "Settings" });
                }}
                hitSlop={8}
              >
                <Ionicons name="settings-outline" size={22} color={st.muted} />
              </Pressable>
            </View>
          </View>
        </View>
        <ProgressTrack percent={percent} />
        {days.map((day) => {
          const isCurrent = !cycleCompleted && day.dayNumber === program.dayNumber;
          const muscles = Array.from(new Set(day.block.exercises.flatMap((exercise) => exercise.targetMuscles ?? [])));
          const cover = dayCover(day, programCover);
          return (
            <View
              key={`${day.programId}-${day.dayNumber}`}
              style={[styles.trainingCard, isCurrent && styles.programActive, cycleCompleted && styles.programDone]}
            >
              {cycleCompleted ? <CompletedSeal label={trainingCopy.completedBadge} /> : null}
              <View style={styles.cardRow}>
                {cover ? <Cover uri={cover} style={styles.thumb} fallback={<CardIcon />} /> : <CardIcon />}
                <View style={styles.cardBody}>
                  <Text style={styles.programTitle}>{sessionLabelFromBlock(day.block.identifier ?? day.block.title)}</Text>
                  <Text style={styles.programSub}>
                    {day.block.focus || muscles.join(", ") || trainingCopy.sessionFocusFallback} · {day.block.weeklyFrequency ?? 1}
                    x/semana · descanso {day.block.restTime}s
                  </Text>
                </View>
              </View>
              <GreenButton
                label={cycleCompleted ? trainingCopy.completedBadge : isCurrent ? trainingCopy.startSession : "Bloqueado"}
                disabled={!isCurrent}
                onPress={() => {
                  uiSounds.submit();
                  navigation.navigate("Player", { programId, dayNumber: day.dayNumber });
                }}
              />
            </View>
          );
        })}
        <OutlineButton
          label={trainingCopy.workoutHistory}
          icon="clipboard-outline"
          onPress={() => navigation.navigate("History")}
        />
        <View style={styles.infoGrid}>
          <View style={styles.infoRow}>
            <Ionicons name="people-outline" size={24} color="#df663c" />
            <View style={styles.infoCopy}>
              <Text style={styles.infoLabel}>Professores:</Text>
              <Text style={styles.infoText}>{program.teacherNames?.join(", ") || "Não informado"}</Text>
            </View>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="home-outline" size={24} color="#df663c" />
            <View style={styles.infoCopy}>
              <Text style={styles.infoLabel}>Unidade:</Text>
              <Text style={styles.infoText}>{program.unitName || "Não informada"}</Text>
            </View>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="calendar-outline" size={24} color="#df663c" />
            <View style={styles.infoCopy}>
              <Text style={styles.infoLabel}>Início da matrícula:</Text>
              <Text style={styles.infoText}>{formatStudentDate(membershipStartsAt)}</Text>
            </View>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="calendar-outline" size={24} color="#df663c" />
            <View style={styles.infoCopy}>
              <Text style={styles.infoLabel}>Vencimento da matrícula:</Text>
              <Text style={styles.infoText}>{formatStudentDate(membershipEndsAt)}</Text>
            </View>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="calendar-outline" size={24} color="#df663c" />
            <View style={styles.infoCopy}>
              <Text style={styles.infoLabel}>Duração do treino:</Text>
              <Text style={styles.infoText}>{formatProgramDuration(program.duration)}</Text>
            </View>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="calendar-outline" size={24} color="#df663c" />
            <View style={styles.infoCopy}>
              <Text style={styles.infoLabel}>Término previsto:</Text>
              <Text style={styles.infoText}>{formatStudentDate(program.duration?.plannedEndsAt)}</Text>
            </View>
          </View>
        </View>
      </View>
    </StudentPage>
  );
}

export function HistoryScreen() {
  const { consistency, programs } = useStudent();
  const navigation = useNavigation();
  const styles = useTrainingStyles();
  const sessions = [...(consistency?.sessions ?? [])].sort(
    (first, second) =>
      new Date(second.finishedAt ?? second.startedAt).getTime() - new Date(first.finishedAt ?? first.startedAt).getTime()
  );
  function musclesFor(dayNumber: number) {
    const day =
      programs.flatMap((program) => program.sequence ?? [program]).find((item) => item.dayNumber === dayNumber) ??
      programs[0];
    const muscles = day?.block.exercises.flatMap((exercise) => exercise.targetMuscles ?? []) ?? [];
    return Array.from(new Set(muscles)).join(", ") || "Músculos não registrados";
  }
  return (
    <StudentPage>
      <BackChip label="Voltar" onPress={() => navigation.goBack()} />
      <SheetHeading kicker="Treino" title="Histórico de treinos" subtitle="Consulte todas as execuções do seu treino atual." />
      {sessions.length === 0 ? (
        <EmptyState icon="clipboard-outline" title="Nenhum treino concluído" text="Finalize um treino para registrar no histórico." />
      ) : (
        sessions.map((item) => (
          <View key={item.id} style={styles.history}>
            <Text style={styles.metaSmall}>Treino</Text>
            <Text style={styles.programTitle}>Treino dia {item.dayNumber}</Text>
            <Text style={styles.programSub}>{musclesFor(item.dayNumber)}</Text>
            <Text style={styles.programSub}>{new Date(item.startedAt).toLocaleString("pt-BR")}</Text>
            <Text style={styles.programSub}>
              Tempo de duração · {item.durationSeconds ? `${Math.round(item.durationSeconds / 60)} min` : "Não registrado"}
            </Text>
            <Text style={styles.programSub}>Sessão · {item.id.slice(-6).toUpperCase()}</Text>
            <OutlineButton
              label="Compartilhar histórico"
              icon="share-outline"
              onPress={() => {
                void Share.share({
                  message: `Treino dia ${item.dayNumber} concluído em ${new Date(item.startedAt).toLocaleString("pt-BR")} no App Treino. ${musclesFor(item.dayNumber)}`
                });
              }}
            />
          </View>
        ))
      )}
    </StudentPage>
  );
}

export function WorkoutPlayerScreen() {
  const { programs, session, refresh } = useStudent();
  const navigation = useNavigation();
  const { st } = useSt();
  const route = useRoute<RouteProp<TrainingStackParamList, "Player">>();
  const program = programs.find((item) => item.programId === route.params.programId);
  const day =
    program?.sequence?.find((item) => item.dayNumber === route.params.dayNumber) ??
    (program?.dayNumber === route.params.dayNumber ? program : program);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionActive, setSessionActive] = useState(false);

  useLayoutEffect(() => {
    const parent = navigation.getParent();
    parent?.setOptions({
      tabBarStyle: sessionActive ? { display: "none" } : tabBarStyleFor(st),
      tabBarActiveTintColor: st.tabActive,
      tabBarInactiveTintColor: st.faint
    });
    return () => {
      parent?.setOptions({
        tabBarStyle: tabBarStyleFor(st),
        tabBarActiveTintColor: st.tabActive,
        tabBarInactiveTintColor: st.faint
      });
    };
  }, [navigation, sessionActive, st]);

  if (!program || !day) {
    return (
      <StudentPage chrome={false}>
        <EmptyState icon="alert-circle-outline" title="Sessão não encontrada" text="Volte para o catálogo." />
      </StudentPage>
    );
  }

  return (
    <NativeWorkoutPlayer
      programTitle={program.programTitle}
      blockTitle={day.block.identifier ?? day.block.title}
      exercises={day.block.exercises}
      restTimeDefault={day.block.restTime}
      structureType={day.block.structureType ?? "NORMAL"}
      protocolRounds={day.block.protocolRounds}
      workSeconds={day.block.workSeconds}
      timeCapSeconds={day.block.timeCapSeconds}
      instructions={day.block.instructions}
      sessionId={sessionId}
      token={session.token}
      onSessionActiveChange={setSessionActive}
      onBack={() => navigation.goBack()}
      onWorkoutStart={async () => {
        const response = await apiPost<{ session: { id: string } }>(
          "/student/workout/start-session",
          { assignmentId: program.assignmentId, dayNumber: route.params.dayNumber },
          session.token
        );
        setSessionId(response.session.id);
        return response.session;
      }}
      onCancelSession={async (canceledSessionId) => {
        const id = canceledSessionId ?? sessionId;
        if (!id) return;
        try {
          await apiPost("/student/workout/cancel-session", { sessionId: id }, session.token);
        } catch {
          // reset local even if API fails
        }
        setSessionId(null);
      }}
      onExerciseProgressChange={async (input) => {
        try {
          await apiPost("/student/workout/exercise-progress", input, session.token);
        } catch (caught) {
          throw caught instanceof NativeApiError ? caught : new Error("Não foi possível registrar o exercício.");
        }
      }}
      onWorkoutComplete={async (completedSessionId, share) => {
        try {
          const mediaItems = (share?.mediaItems ?? [])
            .filter((item) => item.url)
            .map((item) => ({
              url: item.url,
              type: item.type,
              ...(item.coverUrl ? { coverUrl: item.coverUrl } : {})
            }));
          const response = await apiPost<{ completed?: boolean; post?: { id: string } | null }>(
            "/student/workout/complete-day",
            {
              assignmentId: program.assignmentId,
              sessionId: completedSessionId,
              publish: share?.publish === true,
              ...(share?.caption ? { caption: share.caption } : {}),
              ...(share?.photoUrl ? { photoUrl: share.photoUrl } : {}),
              ...(share?.videoUrl ? { videoUrl: share.videoUrl } : {}),
              ...(mediaItems.length ? { mediaItems } : {}),
              exerciseCount: share?.exerciseCount ?? day.block.exercises.length
            },
            session.token
          );
          await refresh();
          const published = Boolean(share?.publish && response.post);
          if (share?.publish === true && !response.post) {
            throw new Error("Treino concluído, mas o Feed não recebeu a publicação. Tente de novo.");
          }
          Alert.alert(
            "Treino",
            published
              ? response.completed
                ? `${trainingCopy.programCompletedToast} Treino publicado no Feed.`
                : "Treino publicado no Feed!"
              : response.completed
                ? trainingCopy.programCompletedToast
                : "Treino concluído! Próximo dia liberado."
          );
          if (published) {
            navigation.getParent()?.navigate("FeedTab" as never);
          } else {
            navigation.goBack();
          }
        } catch (caught) {
          throw caught instanceof NativeApiError ? caught : new Error("Conclua todas as séries antes de finalizar.");
        }
      }}
    />
  );
}

function createTrainingStyles(st: StudentTokens) {
  return StyleSheet.create({
    list: { paddingHorizontal: 16, gap: 12 },
    modality: {
      borderWidth: 1,
      borderColor: "rgba(242,180,97,0.2)",
      borderRadius: 14,
      overflow: "hidden",
      backgroundColor: st.card
    },
    modalityMedia: {
      width: "100%",
      aspectRatio: 16 / 9,
      backgroundColor: "#090b0d",
      overflow: "hidden"
    },
    mediaFill: { width: "100%", height: "100%" },
    modalityFallback: {
      width: "100%",
      height: "100%",
      minHeight: 156,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#090b0d"
    },
    modalityCopy: { padding: 16, gap: 5 },
    modalityTitle: { color: st.text, fontSize: 21, fontWeight: "800" },
    modalitySub: { color: st.muted, fontSize: 14, fontWeight: "800" },
    trainingCard: {
      position: "relative",
      gap: 14,
      borderWidth: 1,
      borderColor: st.line,
      borderRadius: 14,
      padding: 16,
      backgroundColor: st.card
    },
    cardRow: { flexDirection: "row", alignItems: "center", gap: 12 },
    cardBody: { flex: 1, minWidth: 0 },
    programActive: { borderColor: "rgba(242,180,97,0.42)", backgroundColor: st.highlight },
    programDone: { borderColor: "rgba(242,180,97,0.5)" },
    thumb: { width: 58, height: 58, borderRadius: 14, backgroundColor: st.card },
    programTitle: { color: st.text, fontSize: 16, fontWeight: "800" },
    programSub: { color: st.muted, fontSize: 13, marginTop: 4, lineHeight: 18 },
    sheetCard: {
      marginHorizontal: 16,
      gap: 18,
      borderWidth: 1,
      borderColor: "rgba(242,180,97,0.18)",
      borderRadius: 18,
      paddingVertical: 20,
      paddingHorizontal: 16,
      backgroundColor: st.card
    },
    sheetBack: {
      alignSelf: "flex-start",
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderWidth: 1,
      borderColor: st.lineStrong,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: st.fill
    },
    sheetBackText: { color: st.goldUi, fontWeight: "800" },
    sheetHeader: { alignItems: "center", gap: 8 },
    sheetKicker: {
      color: st.goldUi,
      fontSize: 13,
      fontWeight: "800",
      textTransform: "uppercase"
    },
    sheetTitle: { color: st.text, fontSize: 25, fontWeight: "800", textAlign: "center" },
    sheetSubtitle: { color: st.muted, fontSize: 16, fontWeight: "800", textAlign: "center" },
    sheetIcon: {
      width: 92,
      height: 92,
      borderRadius: 28,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(242,180,97,0.18)"
    },
    inlineSeal: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
      backgroundColor: "#f2b461"
    },
    inlineSealText: { color: "#1a1208", fontSize: 11, fontWeight: "800", textTransform: "uppercase" },
    favBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderWidth: 1,
      borderColor: "rgba(242,180,97,0.35)",
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 8,
      backgroundColor: "rgba(242,180,97,0.16)"
    },
    favBadgeText: { color: st.goldUi, fontSize: 13, fontWeight: "800" },
    rateRow: { alignItems: "center", gap: 4 },
    rateLabel: { color: st.muted, fontSize: 12, fontWeight: "800" },
    stars: { flexDirection: "row", gap: 8 },
    meta: { gap: 8 },
    metaItem: { gap: 4 },
    metaValueRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
    metaSmall: { color: st.goldUi, fontSize: 12, fontWeight: "800", textTransform: "uppercase" },
    metaStrong: { color: st.text, fontSize: 17, fontWeight: "800", lineHeight: 21, flex: 1 },
    infoGrid: {
      gap: 14,
      borderTopWidth: 1,
      borderTopColor: "rgba(255,255,255,0.18)",
      paddingTop: 18
    },
    infoRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
    infoCopy: { flex: 1, minWidth: 0, gap: 2 },
    infoText: { color: st.muted, fontSize: 13, lineHeight: 18 },
    infoLabel: { color: st.text, fontSize: 16, fontWeight: "800" },
    history: {
      marginHorizontal: 16,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: st.line,
      backgroundColor: st.card,
      padding: 16,
      gap: 6
    }
  });
}
