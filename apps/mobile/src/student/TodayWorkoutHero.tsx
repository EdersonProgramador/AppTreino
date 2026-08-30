import { useEffect, useMemo, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { CompositeNavigationProp, useNavigation } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { CardIcon, GreenButton, OutlineButton, ProgressTrack } from "./layout";
import { sessionLabelFromBlock, trainingCopy } from "./copy";
import { FALLBACK_WORKOUT_MODALITY, openTrainingProgram } from "./navigate";
import { useStudent } from "./StudentContext";
import { moduleOn, useSt, type StudentTokens } from "./theme";
import { uiSounds } from "./uiSounds";
import { WeatherChip } from "./WeatherChip";
import { fetchWeatherHere, type WeatherSnapshot } from "./weather";
import type { StudentTabParamList, TrainingStackParamList } from "../navigation/types";

type TrainingNav = CompositeNavigationProp<
  NativeStackNavigationProp<TrainingStackParamList>,
  BottomTabNavigationProp<StudentTabParamList>
>;

export function TodayWorkoutHero() {
  const { programs, consistency, publicConfig, qrRequested, clearQr, refresh } = useStudent();
  const { st } = useSt();
  const styles = useMemo(() => createHeroStyles(st), [st]);
  const navigation = useNavigation<TrainingNav>();
  const [showQr, setShowQr] = useState(false);
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const today = programs[0];
  const done = consistency?.completedWorkoutCount ?? today?.completedWorkouts ?? 0;
  const total = consistency?.totalWorkoutDays ?? today?.totalWorkouts ?? today?.totalDays ?? 0;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  const muscles = useMemo(
    () => Array.from(new Set(today?.block.exercises.flatMap((item) => item.targetMuscles ?? []) ?? [])),
    [today]
  );
  const exercises = today?.block.exercises ?? [];
  const qrEnabled = moduleOn(publicConfig, "module_qr") && publicConfig["qr_checkin_enabled"] !== "false";
  const aiEnabled = moduleOn(publicConfig, "module_ai");
  const qrUrl = publicConfig["qr_checkin_url"] || "https://edersonprogramador.com/checkin";
  const qrImage = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(qrUrl)}`;

  useEffect(() => {
    void fetchWeatherHere("WORKOUT").then(setWeather).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!qrRequested) return;
    setShowQr(true);
    clearQr();
  }, [clearQr, qrRequested]);

  return (
    <View style={styles.hero}>
      <Text style={styles.heroKicker}>{today ? "Pronto para treinar" : "Seu treino"}</Text>
      <View style={styles.summary}>
        <CardIcon />
        <View style={{ flex: 1 }}>
          <Text style={styles.heroTitle}>
            {today
              ? `${trainingCopy.todayWorkout} · ${sessionLabelFromBlock(today.block.identifier ?? today.block.title)}`
              : trainingCopy.todayWorkout}
          </Text>
          <Text style={styles.heroSub}>
            {today
              ? muscles.join(", ") || today.programTitle || trainingCopy.sessionFocusFallback
              : trainingCopy.noWorkoutsHint}
          </Text>
        </View>
        <Text style={styles.done}>{trainingCopy.sessionsDone(done, total)}</Text>
      </View>
      <ProgressTrack percent={percent} />
      {exercises.length > 0 ? (
        <View style={styles.preview}>
          {exercises.slice(0, 3).map((exercise, index) => (
            <Text key={exercise.id} style={styles.previewItem}>
              {index + 1}- {exercise.title}
            </Text>
          ))}
          {exercises.length > 3 ? (
            <Text style={styles.previewItem}>+{exercises.length - 3} exercícios</Text>
          ) : null}
        </View>
      ) : null}
      {weather ? <WeatherChip weather={weather} sport="WORKOUT" /> : null}
      <View style={styles.actions}>
        {today ? (
          <>
            <View style={{ flex: 1 }}>
              <GreenButton
                label={trainingCopy.continueWorkout}
                onPress={() => {
                  uiSounds.submit();
                  openTrainingProgram(navigation, {
                    programId: today.programId,
                    modality: today.modality
                  });
                }}
              />
            </View>
            <View style={{ flex: 1 }}>
              <OutlineButton
                label={trainingCopy.browseWorkouts}
                onPress={() => {
                  uiSounds.itemSelect();
                  navigation.navigate("Workouts", {
                    modality: today.modality?.trim() || FALLBACK_WORKOUT_MODALITY
                  });
                }}
              />
            </View>
          </>
        ) : null}
      </View>
      {aiEnabled ? (
        <OutlineButton
          icon="sparkles-outline"
          label="Coach IA"
          onPress={() => {
            uiSounds.itemSelect();
            navigation.navigate("MenuTab", { screen: "Ai" });
          }}
        />
      ) : null}
      {qrEnabled ? (
        <OutlineButton
          icon="qr-code-outline"
          label={showQr ? "Fechar QR" : "QR de check-in"}
          onPress={() =>
            setShowQr((value) => {
              if (value) uiSounds.popupClose();
              else uiSounds.popupOpen();
              return !value;
            })
          }
        />
      ) : null}
      {showQr && qrEnabled ? (
        <View style={styles.qr}>
          <Image source={{ uri: qrImage }} style={styles.qrImg} />
          <Text style={styles.heroSub}>Mostre este código na recepção para registrar sua presença.</Text>
          <GreenButton
            label="Confirmar check-in"
            onPress={() => {
              uiSounds.submit();
              setShowQr(false);
              void refresh();
              navigation.navigate("MenuTab", { screen: "Status" });
            }}
          />
        </View>
      ) : null}
    </View>
  );
}

function createHeroStyles(st: StudentTokens) {
  return StyleSheet.create({
    hero: {
      marginHorizontal: 16,
      marginTop: 12,
      padding: 22,
      gap: 16,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: st.line,
      backgroundColor: st.cardSoft
    },
    heroKicker: { color: st.text, fontSize: 22, fontWeight: "800" },
    summary: { flexDirection: "row", alignItems: "center", gap: 14 },
    heroTitle: { color: st.text, fontSize: 16, fontWeight: "800" },
    heroSub: { color: st.muted, fontSize: 14, lineHeight: 20, marginTop: 4 },
    done: { color: st.goldUi, fontWeight: "800", fontSize: 13, textAlign: "right", maxWidth: 88 },
    preview: { borderTopWidth: 1, borderTopColor: st.line, paddingTop: 16, gap: 7 },
    previewItem: { color: st.text, fontSize: 14, fontWeight: "600" },
    actions: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    qr: {
      alignItems: "center",
      gap: 14,
      borderWidth: 1,
      borderColor: "rgba(212,175,55,0.18)",
      borderRadius: 14,
      padding: 18,
      backgroundColor: "rgba(212,175,55,0.05)"
    },
    qrImg: { width: 220, height: 220, backgroundColor: "#fff" }
  });
}
