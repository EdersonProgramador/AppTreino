import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Alert,
  AppState,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { Audio, ResizeMode, Video } from "expo-av";
import { WebView } from "react-native-webview";
import { MediaImage } from "../lib/MediaImage";
import type { WorkoutExercise, WorkoutStructureType } from "../types";
import { NativeShareFlow } from "./NativeShareFlow";
import { NativeWorkoutBar } from "./NativeWorkoutBar";
import { runner } from "./runnerTheme";
import { uiSounds } from "../student/uiSounds";
import {
  clearWorkoutRunner,
  computeElapsed,
  computeRestRemaining,
  readWorkoutRunner,
  writeWorkoutRunner,
  type RunnerPanel,
  type RunnerPhase
} from "./persist";
import {
  dropSetMax,
  exerciseInstanceKey,
  formatElapsedTime,
  getYouTubeEmbedUrl,
  instructionSteps,
  intensityLabel,
  isImageMedia,
  isVideoMedia,
  isYouTubeUrl,
  prescribedReps,
  prescriptionLabel,
  parseLoad,
  previewMediaUrl,
  resolvedMedia,
  restPauseRestSeconds,
  restPauseTargetReps,
  structureTypeLabels
} from "./helpers";

type Props = {
  programTitle: string;
  blockTitle: string;
  exercises: WorkoutExercise[];
  restTimeDefault: number;
  structureType?: WorkoutStructureType;
  protocolRounds?: number | null;
  workSeconds?: number | null;
  timeCapSeconds?: number | null;
  instructions?: string | null;
  sessionId?: string | null;
  onBack: () => void;
  onWorkoutStart?: () => Promise<{ id: string } | void> | { id: string } | void;
  onCancelSession?: (sessionId: string | null) => Promise<void> | void;
  onSessionActiveChange?: (active: boolean) => void;
  onExerciseProgressChange?: (input: {
    sessionId?: string | null;
    exerciseId: string;
    prescriptionId: string;
    completed: boolean;
    weightUsed: number;
    repsCompleted: number;
    sets: number;
    durationSeconds?: number;
    distanceMeters?: number;
    roundsCompleted?: number;
    perceivedExertion?: number;
    notes?: string;
  }) => Promise<void> | void;
  onWorkoutComplete?: (sessionId: string) => Promise<void> | void;
};

function MediaFallback() {
  return <Ionicons name="barbell" size={54} color="#cfd2d3" />;
}

function MediaBlock({
  exercise,
  expanded = false,
  resting = false,
  lesson = false
}: {
  exercise: WorkoutExercise;
  expanded?: boolean;
  resting?: boolean;
  lesson?: boolean;
}) {
  const url = resolvedMedia(exercise.videoUrl);
  const youtube = isYouTubeUrl(url) ? getYouTubeEmbedUrl(url, lesson) : "";
  const preview = previewMediaUrl(exercise.videoUrl);
  const height = expanded ? 220 : 180;

  if (resting) {
    return (
      <View style={[styles.mediaFrame, styles.mediaRest, { height }]}>
        <View style={styles.restStage}>
          <Ionicons name="timer-outline" size={54} color={runner.coral} />
        </View>
      </View>
    );
  }
  if (youtube && expanded) {
    return <WebView source={{ uri: youtube }} style={[styles.mediaFrame, { height }]} allowsFullscreenVideo />;
  }
  if (url && isVideoMedia(url) && !isImageMedia(url) && !isYouTubeUrl(url)) {
    return (
      <Video
        source={{ uri: url }}
        style={[styles.mediaFrame, { height }]}
        resizeMode={expanded ? ResizeMode.COVER : ResizeMode.CONTAIN}
        shouldPlay={lesson}
        isLooping={lesson || !expanded}
        isMuted={!expanded}
        useNativeControls={expanded}
      />
    );
  }
  if (preview || url) {
    return (
      <View style={[styles.mediaFrame, { height }]}>
        <MediaImage
          uri={preview || url}
          style={styles.mediaFill}
          resizeMode={expanded ? "cover" : "contain"}
          fallback={<MediaFallback />}
        />
      </View>
    );
  }
  return (
    <View style={[styles.mediaFrame, { height }]}>
      <MediaFallback />
    </View>
  );
}

function GuidanceAudio({ uri }: { uri: string }) {
  const soundRef = useRef<Audio.Sound | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    return () => {
      void soundRef.current?.unloadAsync();
      soundRef.current = null;
    };
  }, [uri]);

  async function toggle() {
    try {
      if (!soundRef.current) {
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, staysActiveInBackground: false });
        const { sound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: true });
        soundRef.current = sound;
        sound.setOnPlaybackStatusUpdate((status) => {
          if (!status.isLoaded) return;
          setPlaying(status.isPlaying);
          if (status.didJustFinish) setPlaying(false);
        });
        setPlaying(true);
        return;
      }
      const status = await soundRef.current.getStatusAsync();
      if (status.isLoaded && status.isPlaying) await soundRef.current.pauseAsync();
      else await soundRef.current.playAsync();
    } catch {
      Alert.alert("Áudio", "Não foi possível reproduzir a orientação.");
    }
  }

  return (
    <Pressable style={styles.audioBtn} onPress={() => void toggle()}>
      <Ionicons name={playing ? "pause" : "play"} size={16} color={runner.coral} />
      <Text style={styles.audioText}>{playing ? "Pausar áudio" : "Áudio de orientação"}</Text>
    </Pressable>
  );
}

function SetDot({
  label,
  complete,
  active,
  resting,
  large
}: {
  label: ReactNode;
  complete?: boolean;
  active?: boolean;
  resting?: boolean;
  large?: boolean;
}) {
  return (
    <View
      style={[
        large ? styles.setDotLg : styles.setDot,
        complete && styles.setDone,
        active && !resting && styles.setActive,
        active && resting && styles.setRest
      ]}
    >
      {typeof label === "string" || typeof label === "number" ? (
        <Text style={[styles.setDotText, (complete || (active && resting)) && styles.setDotOn]}>
          {complete ? "✓" : label}
        </Text>
      ) : (
        label
      )}
    </View>
  );
}

export function NativeWorkoutPlayer({
  programTitle,
  blockTitle,
  exercises,
  restTimeDefault,
  structureType = "NORMAL",
  protocolRounds,
  workSeconds,
  timeCapSeconds,
  instructions,
  sessionId,
  onBack,
  onWorkoutStart,
  onCancelSession,
  onSessionActiveChange,
  onExerciseProgressChange,
  onWorkoutComplete
}: Props) {
  const insets = useSafeAreaInsets();
  const elapsedBaseRef = useRef(0);
  const runningStartedAtRef = useRef<number | null>(null);
  const restEndsAtRef = useRef<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(sessionId ?? null);
  const [panel, setPanel] = useState<RunnerPanel>("sequence");
  const [phase, setPhase] = useState<RunnerPhase>("idle");
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [altPick, setAltPick] = useState<Record<string, number>>({});
  const [currentSet, setCurrentSet] = useState(1);
  const [restRemaining, setRestRemaining] = useState(0);
  const [advanceAfterRest, setAdvanceAfterRest] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [lastExerciseNoticeOpen, setLastExerciseNoticeOpen] = useState(false);
  const [workoutReadyToComplete, setWorkoutReadyToComplete] = useState(false);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [dayCompleted, setDayCompleted] = useState(false);
  const [loads, setLoads] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      exercises.map((exercise) => [
        exerciseInstanceKey(exercise),
        exercise.latestWeightUsed ? String(exercise.latestWeightUsed) : exercise.initialLoad ?? ""
      ])
    )
  );
  const [actualReps, setActualReps] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      exercises.map((exercise) => [
        exerciseInstanceKey(exercise),
        prescribedReps(exercise) ? String(prescribedReps(exercise)) : ""
      ])
    )
  );
  const [perceivedEffort, setPerceivedEffort] = useState<Record<string, string>>({});
  const [dropCount, setDropCount] = useState(0);
  const [restPauseAccum, setRestPauseAccum] = useState(0);
  const [hydrated, setHydrated] = useState(false);

  const currentExercise = exercises[currentExerciseIndex] ?? exercises[0];
  const currentExerciseKey = currentExercise ? exerciseInstanceKey(currentExercise) : "";
  const displayedExercise = useMemo(() => {
    const pick = altPick[currentExerciseKey] ?? -1;
    const alt = pick >= 0 ? currentExercise?.alternatives?.[pick] : null;
    if (!currentExercise || !alt) return currentExercise;
    return {
      ...currentExercise,
      title: alt.title,
      videoUrl: alt.videoUrl,
      audioUrl: alt.audioUrl ?? currentExercise.audioUrl,
      materialUrl: alt.materialUrl ?? currentExercise.materialUrl
    };
  }, [altPick, currentExercise, currentExerciseKey]);
  const currentLoad = currentExerciseKey ? (loads[currentExerciseKey] ?? "") : "";
  const isBiSet = structureType === "BI_SET";
  const isDropSet = structureType === "DROP_SET";
  const isRestPause = structureType === "REST_PAUSE";
  const isDropRound = isDropSet && dropCount > 0;
  const pairBaseIndex = currentExerciseIndex % 2 === 1 ? currentExerciseIndex - 1 : currentExerciseIndex;
  const pairMateIndex = currentExerciseIndex % 2 === 0 ? currentExerciseIndex + 1 : currentExerciseIndex - 1;
  const pairHasMate = pairMateIndex >= 0 && pairMateIndex < exercises.length;
  const currentRestSeconds = isDropRound
    ? Math.min(restTimeDefault, 20)
    : isRestPause
      ? restPauseRestSeconds
      : (currentExercise?.restSeconds ?? restTimeDefault);
  const clusterReps = Math.max(1, currentExercise ? prescribedReps(currentExercise) : 0);
  const clusterCount = Math.max(1, Math.ceil((currentExercise ? restPauseTargetReps(currentExercise) : 0) / clusterReps));
  const completedClusters = Math.min(clusterCount, Math.floor(restPauseAccum / clusterReps));
  const allCompleted = exercises.length > 0 && completedIds.size === exercises.length;
  const muscles = useMemo(() => currentExercise?.targetMuscles ?? [], [currentExercise]);
  const equipment = useMemo(() => currentExercise?.equipmentTags ?? [], [currentExercise]);
  const isDetailPanel = panel === "execution" || panel === "muscles" || panel === "expand" || panel === "video" || panel === "load";
  const currentVideoUrl = currentExercise && isVideoMedia(resolvedMedia(currentExercise.videoUrl)) ? resolvedMedia(currentExercise.videoUrl) : "";
  const currentAudioUrl = currentExercise ? resolvedMedia(currentExercise.audioUrl) : "";
  const currentMaterialUrl = currentExercise ? resolvedMedia(currentExercise.materialUrl) : "";
  const exercisesSignature = useMemo(
    () => exercises.map((exercise) => `${exercise.prescriptionId}:${exercise.id}:${exercise.order}:${exercise.sets}`).join("|"),
    [exercises]
  );

  useEffect(() => {
    let live = true;
    void (async () => {
      const restored = await readWorkoutRunner();
      if (!live) return;
      if (!restored) {
        setHydrated(true);
        return;
      }
      elapsedBaseRef.current = restored.elapsedBase;
      runningStartedAtRef.current = restored.runningStartedAt;
      restEndsAtRef.current = restored.restEndsAt;
      setElapsedSeconds(computeElapsed(restored));
      setIsRunning(restored.isRunning);
      setIsPaused(restored.isPaused);
      setActiveSessionId(restored.sessionId ?? sessionId ?? null);
      setPanel(restored.panel);
      setPhase(restored.phase);
      setCurrentExerciseIndex(restored.currentExerciseIndex);
      setCurrentSet(restored.currentSet);
      setRestRemaining(restored.restRemaining);
      setAdvanceAfterRest(restored.advanceAfterRest);
      setWorkoutReadyToComplete(restored.workoutReadyToComplete);
      setCompletedIds(new Set(restored.completedIds));
      setDropCount(restored.dropCount);
      setRestPauseAccum(restored.restPauseAccum);
      setHydrated(true);
    })();
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (sessionId) setActiveSessionId(sessionId);
  }, [sessionId]);

  useEffect(() => {
    onSessionActiveChange?.(isRunning || workoutReadyToComplete);
  }, [isRunning, onSessionActiveChange, workoutReadyToComplete]);

  useEffect(() => {
    setLoads(
      Object.fromEntries(
        exercises.map((exercise) => [
          exerciseInstanceKey(exercise),
          exercise.latestWeightUsed ? String(exercise.latestWeightUsed) : exercise.initialLoad ?? ""
        ])
      )
    );
    setActualReps(
      Object.fromEntries(
        exercises.map((exercise) => [
          exerciseInstanceKey(exercise),
          prescribedReps(exercise) ? String(prescribedReps(exercise)) : ""
        ])
      )
    );
    if (isRunning || workoutReadyToComplete) return;
    setPerceivedEffort({});
    setCurrentExerciseIndex(0);
    setCurrentSet(1);
    setRestRemaining(0);
    setAdvanceAfterRest(false);
    setPanel("sequence");
    setPhase("idle");
    setCompletedIds(new Set());
    setDayCompleted(false);
    setFinishOpen(false);
    setShareOpen(false);
    setLastExerciseNoticeOpen(false);
    setWorkoutReadyToComplete(false);
    setDropCount(0);
    setRestPauseAccum(0);
  }, [exercisesSignature]);

  useEffect(() => {
    if (!isRunning || isPaused) return;
    const tick = () => {
      setElapsedSeconds(
        computeElapsed({
          isRunning: true,
          isPaused: false,
          elapsedBase: elapsedBaseRef.current,
          runningStartedAt: runningStartedAtRef.current
        })
      );
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [isPaused, isRunning]);

  useEffect(() => {
    if (isRunning && !isPaused && !runningStartedAtRef.current) {
      runningStartedAtRef.current = Date.now();
    }
    if (isPaused || !isRunning) {
      elapsedBaseRef.current = elapsedSeconds;
      runningStartedAtRef.current = null;
    }
  }, [elapsedSeconds, isPaused, isRunning]);

  useEffect(() => {
    if (!hydrated) return;
    if (!isRunning) {
      if (!workoutReadyToComplete) void clearWorkoutRunner();
      return;
    }
    void writeWorkoutRunner({
      sessionId: activeSessionId,
      isRunning,
      isPaused,
      panel,
      phase,
      currentExerciseIndex,
      currentSet,
      restRemaining,
      restEndsAt: restEndsAtRef.current,
      elapsedBase: elapsedBaseRef.current,
      runningStartedAt: runningStartedAtRef.current,
      completedIds: [...completedIds],
      dropCount,
      restPauseAccum,
      workoutReadyToComplete,
      advanceAfterRest
    });
  }, [
    activeSessionId,
    advanceAfterRest,
    completedIds,
    currentExerciseIndex,
    currentSet,
    dropCount,
    hydrated,
    isPaused,
    isRunning,
    panel,
    phase,
    restPauseAccum,
    restRemaining,
    workoutReadyToComplete
  ]);

  useEffect(() => {
    if (phase !== "rest") restEndsAtRef.current = null;
  }, [phase]);

  useEffect(() => {
    if (isPaused && phase === "rest" && restEndsAtRef.current) {
      const left = computeRestRemaining(restEndsAtRef.current, restRemaining);
      restEndsAtRef.current = null;
      setRestRemaining(left);
      return;
    }
    if (!isPaused && phase === "rest" && restRemaining > 0 && !restEndsAtRef.current) {
      restEndsAtRef.current = Date.now() + restRemaining * 1000;
    }
  }, [isPaused, phase]);

  useEffect(() => {
    if (phase !== "rest" || isPaused) return;
    const tick = () => {
      if (!restEndsAtRef.current) return;
      setRestRemaining(computeRestRemaining(restEndsAtRef.current, 0));
    };
    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [isPaused, phase]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next !== "active") return;
      if (isRunning && !isPaused) {
        setElapsedSeconds(
          computeElapsed({
            isRunning: true,
            isPaused: false,
            elapsedBase: elapsedBaseRef.current,
            runningStartedAt: runningStartedAtRef.current
          })
        );
      }
      if (phase === "rest" && !isPaused && restEndsAtRef.current) {
        setRestRemaining(computeRestRemaining(restEndsAtRef.current, 0));
      }
    });
    return () => sub.remove();
  }, [isPaused, isRunning, phase]);

  useEffect(() => {
    if (phase !== "rest" || restRemaining !== 0 || !currentExercise) return;

    if (advanceAfterRest) {
      setAdvanceAfterRest(false);
      if (isDropSet && dropCount < dropSetMax) {
        setDropCount(dropCount + 1);
        setCurrentSet((set) => Math.max(set, currentExercise.sets));
        setRestPauseAccum(0);
        setPhase("active");
        setRestRemaining(0);
        return;
      }
      if (isBiSet) {
        setCompletedIds((current) => {
          const next = new Set(current);
          next.add(exerciseInstanceKey(currentExercise));
          const baseExercise = exercises[pairBaseIndex];
          if (baseExercise && currentExerciseIndex !== pairBaseIndex) {
            next.add(exerciseInstanceKey(baseExercise));
          }
          return next;
        });
      } else {
        setCompletedIds((current) => new Set(current).add(exerciseInstanceKey(currentExercise)));
      }
      setDropCount(0);
      setRestPauseAccum(0);
      moveToNextExercise();
      return;
    }

    if (isBiSet) {
      const baseExercise = exercises[pairBaseIndex];
      const mateExercise = exercises[pairMateIndex];
      const pairSets = Math.max(baseExercise?.sets ?? 0, mateExercise?.sets ?? 0);
      const nextSet = Math.min(currentSet + 1, Math.max(pairSets, 1));
      const canSkipBase = Boolean(baseExercise && currentExerciseIndex !== pairBaseIndex && nextSet > baseExercise.sets);
      setCurrentSet(nextSet);
      setCurrentExerciseIndex(canSkipBase ? pairMateIndex : pairBaseIndex);
      setPhase("active");
      return;
    }

    if (isRestPause) {
      if (restPauseAccum >= restPauseTargetReps(currentExercise)) {
        setRestPauseAccum(0);
        setCurrentSet((set) => Math.min(set + 1, currentExercise.sets));
      }
      setPhase("active");
      return;
    }

    if (isBiSet) {
      setCurrentSet((set) => Math.min(set + 1, currentExercise.sets));
      setCurrentExerciseIndex(pairBaseIndex);
      setPhase("active");
      return;
    }

    setCurrentSet((set) => Math.min(set + 1, currentExercise.sets));
    setPhase("active");
  }, [advanceAfterRest, currentExercise, currentExerciseIndex, dropCount, exercises, isBiSet, isDropSet, isRestPause, pairBaseIndex, pairMateIndex, phase, restPauseAccum, restRemaining]);

  useEffect(() => {
    if (!lastExerciseNoticeOpen) return;
    const timeout = setTimeout(() => setLastExerciseNoticeOpen(false), 2000);
    return () => clearTimeout(timeout);
  }, [lastExerciseNoticeOpen]);

  function showLastExerciseNotice() {
    setLastExerciseNoticeOpen(false);
    setTimeout(() => setLastExerciseNoticeOpen(true), 0);
  }

  function returnToRunner() {
    setPanel("run");
  }

  function moveToNextExercise() {
    if (currentExerciseIndex < exercises.length - 1) {
      const nextIndex = currentExerciseIndex + 1;
      setCurrentExerciseIndex(nextIndex);
      setCurrentSet(1);
      setRestRemaining(0);
      setAdvanceAfterRest(false);
      setDropCount(0);
      setRestPauseAccum(0);
      setPanel("run");
      setPhase("active");
      if (nextIndex === exercises.length - 1) showLastExerciseNotice();
      return;
    }
    setPhase("idle");
    setAdvanceAfterRest(false);
    setDropCount(0);
    setRestPauseAccum(0);
    setWorkoutReadyToComplete(true);
    uiSounds.popupOpen();
    uiSounds.complete();
    setFinishOpen(true);
  }

  async function startWorkout(openRunner = true) {
    if (isRunning) {
      if (openRunner) {
        setPanel("run");
        setPhase((current) => (current === "idle" ? "active" : current));
      }
      return activeSessionId;
    }
    if (isStarting) return null;
    setIsStarting(true);
    try {
      const started = await onWorkoutStart?.();
      const nextSessionId = started && "id" in started ? started.id : null;
      setActiveSessionId(nextSessionId);
      elapsedBaseRef.current = 0;
      runningStartedAtRef.current = Date.now();
      setElapsedSeconds(0);
      setIsRunning(true);
      setIsPaused(false);
      if (openRunner) {
        setPanel("run");
        setPhase("active");
      }
      return nextSessionId;
    } catch {
      setIsRunning(false);
      setIsPaused(false);
      setPhase("idle");
      return null;
    } finally {
      setIsStarting(false);
    }
  }

  async function saveExerciseProgress(exercise: WorkoutExercise, completedSets: number, sessionIdForProgress?: string | null) {
    const instanceKey = exerciseInstanceKey(exercise);
    await onExerciseProgressChange?.({
      sessionId: sessionIdForProgress ?? activeSessionId,
      exerciseId: exercise.id,
      prescriptionId: exercise.prescriptionId,
      completed: true,
      weightUsed: parseLoad(loads[instanceKey] || ""),
      repsCompleted: Math.max(0, Number(actualReps[instanceKey]) || 0),
      sets: Math.max(1, completedSets),
      durationSeconds: exercise.durationSeconds ?? exercise.workSeconds ?? undefined,
      distanceMeters: exercise.distanceMeters ?? undefined,
      roundsCompleted: exercise.rounds ?? undefined,
      perceivedExertion: perceivedEffort[instanceKey] ? Number(perceivedEffort[instanceKey]) : undefined,
      notes: exercise.executionNotes || undefined
    });
  }

  async function completeSet() {
    let sessionIdForProgress = activeSessionId;
    if (!isRunning || !sessionIdForProgress) {
      sessionIdForProgress = await startWorkout();
      if (!sessionIdForProgress) return;
    }
    if (phase === "rest" || !currentExercise) return;
    try {
      await saveExerciseProgress(currentExercise, currentSet, sessionIdForProgress);
    } catch {
      return;
    }
    const exerciseSets = currentExercise.sets;
    if (isBiSet) {
      if (currentExerciseIndex % 2 === 0 && pairHasMate) {
        if (currentSet > currentExercise.sets) {
          setCurrentExerciseIndex(pairMateIndex);
          setPhase("active");
          setRestRemaining(0);
          setAdvanceAfterRest(false);
          return;
        }
        if (currentSet >= currentExercise.sets) {
          setCompletedIds((current) => new Set(current).add(exerciseInstanceKey(currentExercise)));
        }
        setCurrentExerciseIndex(pairMateIndex);
        setPhase("active");
        setRestRemaining(0);
        setAdvanceAfterRest(false);
        return;
      }
      const baseExercise = exercises[pairBaseIndex];
      const mateExercise = exercises[pairMateIndex];
      const pairSets = Math.max(baseExercise?.sets ?? 0, mateExercise?.sets ?? 0);
      setAdvanceAfterRest(currentSet >= pairSets);
      restEndsAtRef.current = Date.now() + currentRestSeconds * 1000;
      setPhase("rest");
      setRestRemaining(currentRestSeconds);
      return;
    }
    if (isRestPause) {
      const nextAccum = restPauseAccum + prescribedReps(currentExercise);
      setRestPauseAccum(nextAccum);
      setAdvanceAfterRest(nextAccum >= restPauseTargetReps(currentExercise) && currentSet >= exerciseSets);
      restEndsAtRef.current = Date.now() + currentRestSeconds * 1000;
      setPhase("rest");
      setRestRemaining(currentRestSeconds);
      return;
    }
    setAdvanceAfterRest(currentSet >= exerciseSets);
    restEndsAtRef.current = Date.now() + currentRestSeconds * 1000;
    setPhase("rest");
    setRestRemaining(currentRestSeconds);
  }

  function finishRestNow() {
    if (phase !== "rest") return;
    restEndsAtRef.current = null;
    setRestRemaining(0);
  }

  async function saveLoad() {
    let sessionIdForProgress = activeSessionId;
    if (!sessionIdForProgress) sessionIdForProgress = await startWorkout();
    if (!sessionIdForProgress || !currentExercise) return;
    await saveExerciseProgress(currentExercise, Math.max(1, currentSet - (phase === "rest" ? 0 : 1)), sessionIdForProgress);
    setPanel("run");
  }

  async function confirmCancel() {
    await clearWorkoutRunner();
    await onCancelSession?.(activeSessionId);
    setCancelOpen(false);
    onBack();
  }

  function handleHeaderBack() {
    if (isDetailPanel) {
      setPanel("run");
      return;
    }
    if (panel === "run" && (isRunning || workoutReadyToComplete)) {
      setPanel("sequence");
      return;
    }
    if (isRunning || workoutReadyToComplete) {
      uiSounds.popupOpen();
      setCancelOpen(true);
      return;
    }
    onBack();
  }

  function openExerciseFromSequence(index: number) {
    if (isRunning) {
      if (index !== currentExerciseIndex) return;
      setPanel("run");
      setPhase((current) => (current === "idle" ? "active" : current));
      return;
    }
    setCurrentExerciseIndex(index);
    setCurrentSet(1);
    setDropCount(0);
    setRestPauseAccum(0);
    setPanel("run");
    setPhase("idle");
  }

  function openSharePrompt() {
    uiSounds.popupOpen();
    uiSounds.submit();
    setIsPaused(true);
    setFinishOpen(false);
    setShareOpen(true);
  }

  async function completeWorkout() {
    if (!workoutReadyToComplete || !allCompleted || dayCompleted || !activeSessionId) return;
    uiSounds.workoutComplete();
    setDayCompleted(true);
    try {
      await onWorkoutComplete?.(activeSessionId);
      await clearWorkoutRunner();
      setIsRunning(false);
      setIsPaused(false);
      setElapsedSeconds(0);
      setCompletedIds(new Set());
      setActiveSessionId(null);
      setShareOpen(false);
      setFinishOpen(false);
      setWorkoutReadyToComplete(false);
    } catch {
      setDayCompleted(false);
      uiSounds.error();
    }
  }

  function onCenterClick() {
    if (isDetailPanel) {
      returnToRunner();
      return;
    }
    if (panel === "sequence") {
      if (isRunning) {
        setPanel("run");
        setPhase((current) => (current === "idle" ? "active" : current));
        return;
      }
      void startWorkout();
      return;
    }
    if (phase === "rest") {
      finishRestNow();
      return;
    }
    if (!isRunning) {
      void startWorkout();
      return;
    }
    void completeSet();
  }

  function onNextExercise() {
    if (isDetailPanel) {
      returnToRunner();
      return;
    }
    if (panel !== "run" || isRunning || phase === "rest") return;
    if (currentExerciseIndex < exercises.length - 1) {
      const nextIndex = currentExerciseIndex + 1;
      setCurrentExerciseIndex(nextIndex);
      setCurrentSet(1);
      setRestRemaining(0);
      setAdvanceAfterRest(false);
      setDropCount(0);
      setRestPauseAccum(0);
      setPhase("active");
      if (nextIndex === exercises.length - 1) showLastExerciseNotice();
      return;
    }
    showLastExerciseNotice();
  }

  if (!currentExercise) {
    return (
      <View style={[styles.safe, { paddingTop: insets.top }]}>
        <Text style={styles.muted}>Nenhum exercício carregado.</Text>
      </View>
    );
  }

  const steps = instructionSteps(currentExercise);
  const compactHeader = panel === "sequence";

  const centerContent =
    isDetailPanel ? (
      <View style={styles.startFace}>
        <Ionicons name="arrow-back" size={18} color={runner.mbGold} />
        <Text style={styles.startCaption}>Voltar</Text>
      </View>
    ) : phase === "rest" && panel === "run" ? (
      <View style={styles.startFace}>
        <Text style={styles.startTime}>{restRemaining}</Text>
        <Text style={styles.startCaption}>Descanso</Text>
      </View>
    ) : isRunning && panel === "sequence" ? (
      <View style={styles.startFace}>
        <Ionicons name={phase === "rest" ? "timer-outline" : "play"} size={18} color={runner.mbGold} />
        <Text style={styles.startCaption}>{phase === "rest" ? `${restRemaining}s` : "Continuar"}</Text>
      </View>
    ) : isDropRound ? (
      <View style={styles.startFace}>
        <Text style={styles.startStrong}>
          DROP {dropCount}/{dropSetMax}
        </Text>
        <Text style={styles.startCaption}>Concluir</Text>
      </View>
    ) : isRestPause ? (
      <View style={styles.startFace}>
        <Ionicons name="checkmark" size={18} color={runner.mbGold} />
        <Text style={styles.startCaption}>
          Cluster {completedClusters + 1}/{clusterCount}
        </Text>
      </View>
    ) : (
      <View style={styles.startFace}>
        <Ionicons
          name={isRunning && panel === "run" ? "checkmark" : "trophy"}
          size={isRunning && panel === "run" ? 22 : 26}
          color={runner.mbGold}
        />
        <Text style={styles.startCaption}>{isStarting ? "Iniciando" : isRunning && panel === "run" ? "Realizado" : "Iniciar"}</Text>
      </View>
    );

  return (
    <View style={styles.safe}>
      <StatusBar style="light" />
      <LinearGradient
        colors={["#f2b461", "#df663c", "#c73d2e"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: insets.top + (compactHeader ? 4 : 6) }]}
      >
        <Pressable onPress={handleHeaderBack} style={[styles.headerBtn, compactHeader && styles.headerBtnSm]} hitSlop={12}>
          <Ionicons name="arrow-back" size={20} color="#fff" />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>{panel === "sequence" && isRunning ? "Sequência" : "Execução"}</Text>
          <View style={styles.headerChip}>
            <Ionicons name="timer-outline" size={13} color="#fff8ec" />
            <Text style={styles.headerTime}>{formatElapsedTime(elapsedSeconds)}</Text>
          </View>
        </View>
        <Pressable
          onPress={() => isRunning && setIsPaused((current) => !current)}
          disabled={!isRunning}
          style={[styles.headerBtn, compactHeader && styles.headerBtnSm, !isRunning && styles.disabled]}
        >
          <Ionicons name={isPaused || !isRunning ? "play" : "pause"} size={18} color="#fff" />
        </Pressable>
      </LinearGradient>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.body, panel === "run" && styles.bodyRun, panel === "sequence" && styles.bodySequence]}
          keyboardShouldPersistTaps="handled"
          scrollEnabled={panel !== "run" || phase !== "rest"}
        >
          {panel === "sequence" && (
            <View style={styles.gap}>
              <View style={styles.summary}>
                <Text style={styles.summaryTitle}>{programTitle}</Text>
                <Text style={styles.summaryCount}>{exercises.length} exercício(s)</Text>
              </View>
              {structureType !== "NORMAL" ? <Text style={styles.modeBadge}>{structureTypeLabels[structureType]}</Text> : null}
              {(protocolRounds || workSeconds || timeCapSeconds) && (
                <Text style={styles.muted}>
                  {[
                    protocolRounds ? `${protocolRounds} round(s)` : "",
                    workSeconds ? `${workSeconds}s de trabalho` : "",
                    timeCapSeconds ? `limite ${formatElapsedTime(timeCapSeconds)}` : ""
                  ]
                    .filter(Boolean)
                    .join(" | ")}
                </Text>
              )}
              {exercises.map((exercise, index) => {
                const key = exerciseInstanceKey(exercise);
                const selected = index === currentExerciseIndex;
                const isCurrentLive = isRunning && selected;
                const isDone = completedIds.has(key);
                return (
                  <Pressable
                    key={key}
                    style={[
                      styles.seqCard,
                      selected && styles.seqSelected,
                      isCurrentLive && styles.seqLive,
                      isDone && styles.seqDone,
                      isRunning && !selected && !isDone && styles.seqLocked
                    ]}
                    onPress={() => {
                      if (isRunning && index !== currentExerciseIndex) return;
                      if (isRunning && index === currentExerciseIndex) {
                        openExerciseFromSequence(index);
                        return;
                      }
                      setCurrentExerciseIndex(index);
                    }}
                  >
                    <Pressable onPress={() => openExerciseFromSequence(index)}>
                      <MediaImage
                        uri={previewMediaUrl(exercise.videoUrl) || exercise.videoUrl}
                        style={styles.seqThumb}
                        fallback={
                          <View style={styles.seqThumb}>
                            <Ionicons name="trophy" size={22} color={runner.coral} />
                          </View>
                        }
                      />
                    </Pressable>
                    <View style={styles.flex}>
                      <Pressable onPress={() => openExerciseFromSequence(index)}>
                        <Text style={styles.seqTitle}>{exercise.title}</Text>
                      </Pressable>
                      <Text style={styles.seqMuscles}>{(exercise.targetMuscles ?? []).join(", ") || "Grupo muscular não informado"}</Text>
                      {isCurrentLive ? (
                        <Text style={styles.live}>
                          {phase === "rest" ? "Descansando" : "Em andamento"} ·{" "}
                          {isRestPause
                            ? `Cluster ${Math.min(completedClusters + 1, clusterCount)}/${clusterCount}`
                            : `Série ${Math.min(currentSet, exercise.sets)}/${exercise.sets}`}{" "}
                          · {phase === "rest" ? `Descanso ${restRemaining}s` : `Próx. descanso ${currentRestSeconds}s`}
                        </Text>
                      ) : (
                        <Text style={styles.seqMeta}>
                          {exercise.sets} série(s)/ciclo(s) | {prescriptionLabel(exercise)} | {exercise.restSeconds ?? restTimeDefault}s
                        </Text>
                      )}
                      {isCurrentLive ? (
                        <View style={styles.setRow}>
                          {Array.from({ length: Math.max(1, exercise.sets) }).map((_, setIndex) => {
                            const setNumber = setIndex + 1;
                            const complete = isDone || setNumber < currentSet;
                            const active = !complete && setNumber === currentSet;
                            return (
                              <SetDot
                                key={setNumber}
                                label={setNumber}
                                complete={complete}
                                active={active}
                                resting={phase === "rest"}
                              />
                            );
                          })}
                        </View>
                      ) : null}
                    </View>
                    <Pressable
                      style={[styles.toggle, isDone && styles.toggleDone]}
                      disabled={!isCurrentLive}
                      onPress={() => isCurrentLive && openExerciseFromSequence(index)}
                    >
                      <View style={[styles.knob, isDone && styles.knobOn, isCurrentLive && styles.knobLive]}>
                        <Text style={styles.knobText}>
                          {isDone ? "✓" : isCurrentLive ? (phase === "rest" ? restRemaining : currentSet) : index + 1}
                        </Text>
                      </View>
                    </Pressable>
                  </Pressable>
                );
              })}
            </View>
          )}

          {panel === "run" && (
            <View style={styles.focusCard}>
              <Text style={styles.focusTitle}>{currentExercise.title}</Text>
              <View style={[styles.pillRow, isRunning && styles.pillLive]}>
                <Text style={styles.pill}>
                  Séries/ciclos:{" "}
                  <Text style={styles.pillStrong}>
                    {isRunning ? `${Math.min(currentSet, currentExercise.sets)}/${currentExercise.sets}` : currentExercise.sets}
                  </Text>
                </Text>
                {isBiSet ? (
                  <Text style={styles.pill}>
                    Bi-set <Text style={styles.pillStrong}>1A + 1B</Text>
                  </Text>
                ) : null}
                {isDropRound ? (
                  <Text style={styles.pill}>
                    Drop{" "}
                    <Text style={styles.pillStrong}>
                      {dropCount}/{dropSetMax}
                    </Text>
                  </Text>
                ) : null}
                {isRestPause ? (
                  <Text style={styles.pill}>
                    Clusters{" "}
                    <Text style={styles.pillStrong}>
                      {completedClusters}/{clusterCount}
                    </Text>
                  </Text>
                ) : null}
                <Text style={styles.pill}>
                  Descanso:{" "}
                  <Text style={styles.pillStrong}>{isRunning && phase === "rest" ? `${restRemaining}s` : `${currentRestSeconds}s`}</Text>
                </Text>
              </View>
              <MediaBlock exercise={displayedExercise ?? currentExercise} resting={phase === "rest"} />
              {currentExercise.alternatives && currentExercise.alternatives.length > 0 ? (
                <View style={styles.chips}>
                  <Pressable onPress={() => setAltPick((current) => ({ ...current, [currentExerciseKey]: -1 }))}>
                    <Text style={styles.chip}>Original</Text>
                  </Pressable>
                  {currentExercise.alternatives.map((alt, index) => (
                    <Pressable key={alt.id} onPress={() => setAltPick((current) => ({ ...current, [currentExerciseKey]: index }))}>
                      <Text style={styles.chip}>{alt.title}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              {currentAudioUrl ? <GuidanceAudio uri={currentAudioUrl} /> : null}
              <View style={styles.setRowCenter}>
                {(isDropSet
                  ? Array.from({ length: currentExercise.sets + dropSetMax }, (_, index) => {
                      const setNumber = index + 1;
                      const isDropSlot = setNumber > currentExercise.sets;
                      const dropSlotIndex = setNumber - currentExercise.sets;
                      const complete = isDropSlot
                        ? dropCount >= dropSlotIndex
                        : setNumber < currentSet || completedIds.has(currentExerciseKey);
                      const active = !complete && (isDropSlot ? dropCount === dropSlotIndex - 1 && currentSet >= currentExercise.sets : setNumber === currentSet);
                      return { key: setNumber, complete, active, label: isDropSlot ? "D" : String(setNumber) };
                    })
                  : isRestPause
                    ? Array.from({ length: clusterCount }, (_, index) => {
                        const clusterNumber = index + 1;
                        const complete = clusterNumber <= completedClusters || completedIds.has(currentExerciseKey);
                        const active = clusterNumber === completedClusters + 1 && !complete;
                        return { key: clusterNumber, complete, active, label: String(clusterNumber) };
                      })
                    : Array.from({ length: currentExercise.sets }, (_, index) => {
                        const setNumber = index + 1;
                        const complete = setNumber < currentSet || completedIds.has(currentExerciseKey);
                        const active = setNumber === currentSet && !complete;
                        return { key: setNumber, complete, active, label: String(setNumber) };
                      })
                ).map((item) => (
                  <SetDot
                    key={item.key}
                    large
                    label={item.label}
                    complete={item.complete}
                    active={item.active}
                    resting={phase === "rest"}
                  />
                ))}
              </View>
              <View style={styles.metrics}>
                <View style={styles.metric}>
                  <Text style={styles.metricValue}>{prescriptionLabel(currentExercise)}</Text>
                  <Text style={styles.metricLabel}>
                    {isRestPause ? "Repetições por cluster" : isDropRound ? "Repetições até a falha" : "Alvo prescrito"}
                  </Text>
                </View>
                <View style={[styles.metric, styles.metricSplit]}>
                  <Text style={styles.metricValue}>{currentLoad || intensityLabel(currentExercise)}</Text>
                  <Text style={styles.metricLabel}>{isDropRound ? "Carga reduzida" : "Intensidade"}</Text>
                </View>
              </View>
              <View style={styles.actions}>
                <Pressable style={styles.action} onPress={() => setPanel("execution")}>
                  <Ionicons name="document-text-outline" size={16} color={runner.coral} />
                  <Text style={styles.actionText}>Execução</Text>
                </Pressable>
                <Pressable style={styles.action} onPress={() => setPanel("muscles")}>
                  <Ionicons name="body-outline" size={16} color={runner.coral} />
                  <Text style={styles.actionText}>Músculos</Text>
                </Pressable>
                <Pressable style={styles.action} onPress={() => setPanel("expand")}>
                  <Ionicons name="expand-outline" size={16} color={runner.coral} />
                  <Text style={styles.actionText}>Ampliar</Text>
                </Pressable>
                {currentVideoUrl ? (
                  <Pressable style={styles.action} onPress={() => setPanel("video")}>
                    <Ionicons name="play-circle-outline" size={16} color={runner.coral} />
                    <Text style={styles.actionText}>Aula em vídeo</Text>
                  </Pressable>
                ) : null}
                {currentMaterialUrl ? (
                  <Pressable style={styles.action} onPress={() => void Linking.openURL(currentMaterialUrl)}>
                    <Ionicons name="document-outline" size={16} color={runner.coral} />
                    <Text style={styles.actionText}>Material</Text>
                  </Pressable>
                ) : null}
              </View>
              <Pressable style={styles.loadBtn} onPress={() => setPanel("load")}>
                <Ionicons name="construct-outline" size={18} color="#4a4d52" />
                <Text style={styles.loadText}>Registrar execução</Text>
              </Pressable>
            </View>
          )}

          {isDetailPanel && (
            <View style={styles.focusCard}>
              <Pressable style={styles.backLink} onPress={returnToRunner}>
                <Ionicons name="chevron-back" size={18} color={runner.coral} />
                <Text style={styles.backLinkText}>Voltar</Text>
              </Pressable>
              {panel === "execution" && (
                <>
                  <Text style={styles.focusTitle}>{currentExercise.title}</Text>
                  <Text style={styles.muted}>
                    {equipment.length ? `Equipamentos: ${equipment.join(", ")}` : "Use a técnica indicada pelo professor para este exercício."}
                  </Text>
                  <MediaBlock exercise={currentExercise} />
                  <Text style={styles.section}>Descrição</Text>
                  <Text style={styles.muted}>
                    {currentExercise.description || (muscles.length ? `Exercício focado em ${muscles.join(", ")}.` : "Descrição técnica ainda não cadastrada.")}
                  </Text>
                  <Text style={styles.section}>Instrução de execução</Text>
                  {steps.map((step, index) => (
                    <Text key={step} style={styles.muted}>
                      {index + 1}. {step}
                    </Text>
                  ))}
                  {instructions ? (
                    <>
                      <Text style={styles.section}>Orientação da sessão</Text>
                      <Text style={styles.muted}>{instructions}</Text>
                    </>
                  ) : null}
                  {currentExercise.videoUrl ? <MediaBlock exercise={currentExercise} expanded /> : null}
                  {currentAudioUrl ? <GuidanceAudio uri={currentAudioUrl} /> : null}
                  {currentMaterialUrl ? (
                    <Pressable style={styles.loadBtn} onPress={() => void Linking.openURL(currentMaterialUrl)}>
                      <Text style={styles.loadText}>Abrir material</Text>
                    </Pressable>
                  ) : null}
                </>
              )}
              {panel === "muscles" && (
                <>
                  <Text style={styles.focusTitle}>{currentExercise.title}</Text>
                  <View style={styles.muscleVisual}>
                    <Ionicons name="body-outline" size={72} color={runner.coral} />
                  </View>
                  <Text style={styles.section}>Músculos</Text>
                  <View style={styles.chips}>
                    {muscles.length ? (
                      muscles.map((muscle) => (
                        <Text key={muscle} style={styles.chip}>
                          {muscle}
                        </Text>
                      ))
                    ) : (
                      <Text style={styles.muted}>Músculos alvo ainda não cadastrados.</Text>
                    )}
                  </View>
                </>
              )}
              {panel === "expand" && (
                <>
                  <Text style={styles.focusTitle}>{currentExercise.title}</Text>
                  <MediaBlock exercise={currentExercise} expanded />
                  <Text style={styles.section}>Instrução de execução</Text>
                  {steps.map((step, index) => (
                    <Text key={step} style={styles.muted}>
                      {index + 1}. {step}
                    </Text>
                  ))}
                </>
              )}
              {panel === "video" && (
                <>
                  <Text style={styles.focusTitle}>{currentExercise.title}</Text>
                  <Text style={styles.muted}>Aula em vídeo do treino — assista com atenção à execução antes de realizar as séries.</Text>
                  <MediaBlock exercise={currentExercise} expanded lesson />
                  {currentAudioUrl ? <GuidanceAudio uri={currentAudioUrl} /> : null}
                </>
              )}
              {panel === "load" && (
                <>
                  <Text style={styles.focusTitle}>Registrar execução</Text>
                  <Text style={styles.muted}>{currentExercise.title}</Text>
                  <Text style={styles.label}>{isDropRound ? "Carga reduzida no drop" : "Carga utilizada"}</Text>
                  <TextInput
                    value={currentLoad}
                    onChangeText={(value) => setLoads((current) => ({ ...current, [currentExerciseKey]: value }))}
                    placeholder="Ex.: 20 kg"
                    placeholderTextColor={runner.faint}
                    style={styles.input}
                  />
                  {(!currentExercise.prescriptionType || currentExercise.prescriptionType === "REPETITIONS") && (
                    <>
                      <Text style={styles.label}>Repetições realizadas</Text>
                      <TextInput
                        value={actualReps[currentExerciseKey] ?? ""}
                        onChangeText={(value) => setActualReps((current) => ({ ...current, [currentExerciseKey]: value }))}
                        keyboardType="number-pad"
                        placeholder="0"
                        placeholderTextColor={runner.faint}
                        style={styles.input}
                      />
                    </>
                  )}
                  <Text style={styles.label}>Esforço percebido (0 a 10)</Text>
                  <TextInput
                    value={perceivedEffort[currentExerciseKey] ?? ""}
                    onChangeText={(value) => setPerceivedEffort((current) => ({ ...current, [currentExerciseKey]: value }))}
                    keyboardType="decimal-pad"
                    placeholder="Opcional"
                    placeholderTextColor={runner.faint}
                    style={styles.input}
                  />
                  <Pressable style={styles.saveLoad} onPress={() => void saveLoad()}>
                    <Text style={styles.saveLoadText}>Salvar execução</Text>
                  </Pressable>
                </>
              )}
            </View>
          )}
        </ScrollView>

        <View style={{ paddingBottom: insets.bottom }}>
          <NativeWorkoutBar
            centerContent={centerContent}
            centerResting={phase === "rest" && panel === "run"}
            centerDisabled={isStarting || dayCompleted}
            onCenterClick={onCenterClick}
            nextDisabled={isDetailPanel ? false : panel !== "run" || phase === "rest" || isRunning}
            nextLabel={isDetailPanel ? "Voltar" : "Próximo exercício"}
            onNext={onNextExercise}
          />
        </View>
      </KeyboardAvoidingView>

      <Modal visible={cancelOpen} transparent animationType="fade">
        <Pressable style={styles.modalBack} onPress={() => {
          uiSounds.popupClose();
          setCancelOpen(false);
        }}>
          <Pressable style={styles.modal} onPress={() => undefined}>
            <Text style={styles.modalTitle}>Sair sem concluir?</Text>
            <Text style={styles.modalCopy}>O progresso deste dia será resetado e você precisará recomeçar do zero.</Text>
            <View style={styles.modalRow}>
              <Pressable style={styles.yes} onPress={() => {
                uiSounds.void();
                void confirmCancel();
              }}>
                <Text style={styles.yesText}>SIM</Text>
              </Pressable>
              <Pressable style={styles.no} onPress={() => {
                uiSounds.popupClose();
                setCancelOpen(false);
              }}>
                <Text style={styles.noText}>Não</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={finishOpen} transparent animationType="fade">
        <View style={styles.modalBack}>
          <View style={styles.finishModal}>
            <View style={styles.trophy}>
              <Ionicons name="trophy" size={42} color={runner.coral} />
            </View>
            <Text style={styles.modalTitle}>PARABÉNS, TREINO CONCLUÍDO</Text>
            <Text style={styles.modalCopy}>Um passo de cada vez e você vai conquistar todos os seus objetivos. Bom descanso e até o próximo treino!</Text>
            <Text style={styles.durationLabel}>Duração do treino</Text>
            <Text style={styles.duration}>{formatElapsedTime(elapsedSeconds)}</Text>
            <Pressable style={styles.finishPrimary} disabled={dayCompleted} onPress={openSharePrompt}>
              <Text style={styles.finishPrimaryText}>FINALIZAR O TREINO</Text>
            </Pressable>
            <Pressable
              style={styles.finishCancel}
              onPress={() => {
                uiSounds.popupOpen();
                setFinishOpen(false);
                setCancelOpen(true);
              }}
            >
              <Text style={styles.finishCancelText}>SAIR SEM CONCLUIR</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={lastExerciseNoticeOpen} transparent animationType="fade">
        <Pressable style={styles.noticeBack} onPress={() => setLastExerciseNoticeOpen(false)}>
          <View style={styles.notice}>
            <Ionicons name="warning" size={42} color="#ff6972" />
            <View style={styles.flex}>
              <Text style={styles.noticeTitle}>Atenção</Text>
              <Text style={styles.noticeCopy}>Esse é o último exercício do seu treino!</Text>
            </View>
          </View>
        </Pressable>
      </Modal>

      {shareOpen ? (
        <NativeShareFlow
          programTitle={programTitle}
          blockTitle={blockTitle}
          exerciseCount={exercises.length}
          durationLabel={formatElapsedTime(elapsedSeconds)}
          busy={dayCompleted}
          onDismiss={() => void completeWorkout()}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: runner.bg },
  flex: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 8,
    gap: 8
  },
  headerBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)"
  },
  headerBtnSm: { width: 34, height: 34, borderRadius: 17 },
  headerCopy: { flex: 1, alignItems: "center", gap: 2 },
  headerTitle: {
    color: "rgba(255,255,255,0.92)",
    fontWeight: "700",
    fontSize: 11,
    letterSpacing: 1,
    textTransform: "uppercase"
  },
  headerChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 24,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.42)",
    backgroundColor: "rgba(0,0,0,0.22)"
  },
  headerTime: { color: "#fff8ec", fontWeight: "800", fontSize: 13 },
  body: { padding: 12, paddingBottom: 10, gap: 10 },
  bodyRun: { padding: 10, paddingBottom: 4, gap: 6 },
  bodySequence: { padding: 10, paddingBottom: 6, gap: 8 },
  gap: { gap: 10 },
  summary: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  summaryTitle: { flex: 1, color: "#4d4f55", fontWeight: "900", fontSize: 13 },
  summaryCount: { color: runner.coral, fontWeight: "900", fontSize: 13 },
  modeBadge: {
    alignSelf: "flex-start",
    color: runner.ink,
    backgroundColor: runner.gold,
    overflow: "hidden",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontWeight: "800",
    fontSize: 11
  },
  muted: { color: runner.muted, lineHeight: 20, textAlign: "center" },
  seqCard: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    backgroundColor: runner.card,
    borderRadius: 14,
    padding: 10,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2
  },
  seqSelected: { borderWidth: 2, borderColor: "rgba(242,180,97,0.44)" },
  seqLive: { borderWidth: 2, borderColor: "rgba(199,61,46,0.45)" },
  seqDone: { opacity: 0.85 },
  seqLocked: { opacity: 0.55 },
  seqThumb: {
    width: 58,
    height: 58,
    borderRadius: 10,
    backgroundColor: "#eef0f2",
    alignItems: "center",
    justifyContent: "center"
  },
  seqTitle: { color: "#2d2f33", fontWeight: "900", fontSize: 16, lineHeight: 19 },
  seqMuscles: { color: "#55575d", fontSize: 14, marginTop: 2 },
  seqMeta: { color: runner.coral, fontSize: 12, fontWeight: "900", marginTop: 4 },
  live: { color: runner.ember, fontSize: 12, fontWeight: "700", marginTop: 4 },
  toggle: {
    width: 48,
    height: 30,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "#d5d5d5",
    backgroundColor: "#fff",
    padding: 2,
    justifyContent: "center"
  },
  toggleDone: { borderColor: runner.gold },
  knob: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#d8d8d8",
    alignItems: "center",
    justifyContent: "center"
  },
  knobOn: { alignSelf: "flex-end", backgroundColor: runner.coral },
  knobLive: { backgroundColor: runner.ember, alignSelf: "flex-end" },
  knobText: { color: "#fff", fontWeight: "800", fontSize: 10 },
  focusCard: {
    backgroundColor: runner.card,
    borderRadius: 12,
    padding: 10,
    gap: 6,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2
  },
  focusTitle: { color: runner.text, fontSize: 18, fontWeight: "800", textAlign: "center" },
  pillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#d2d4d6",
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 8
  },
  pillLive: { backgroundColor: "rgba(242,180,97,0.1)", borderColor: "rgba(199,61,46,0.35)" },
  pill: { color: "#4b4d52", fontSize: 11 },
  pillStrong: { color: runner.ember, fontWeight: "800" },
  mediaFrame: {
    width: "100%",
    maxWidth: 520,
    borderRadius: 10,
    backgroundColor: "#f7f8f7",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    alignSelf: "center"
  },
  mediaFill: {
    width: "100%",
    height: "100%"
  },
  mediaRest: { backgroundColor: "#fff8f1" },
  restStage: { width: 88, height: 88, alignItems: "center", justifyContent: "center" },
  audioBtn: {
    minHeight: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: runner.line,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  audioText: { color: "#4a4d52", fontWeight: "800", fontSize: 12 },
  setRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  setRowCenter: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8, marginVertical: 4 },
  setDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#c9cbce",
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center"
  },
  setDotLg: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 3,
    borderColor: "#d7d7d7",
    backgroundColor: "#d7d7d7",
    alignItems: "center",
    justifyContent: "center"
  },
  setDone: { borderColor: runner.gold, backgroundColor: runner.coral },
  setActive: { borderColor: runner.coral, backgroundColor: "#fff" },
  setRest: { borderColor: runner.gold, backgroundColor: runner.gold },
  setDotText: { color: "#6a6d73", fontWeight: "800", fontSize: 11 },
  setDotOn: { color: "#fff" },
  metrics: { flexDirection: "row", width: "100%", gap: 8 },
  metric: { flex: 1, alignItems: "center", gap: 2, padding: 8 },
  metricSplit: { borderLeftWidth: 1, borderLeftColor: "#d9dbdc" },
  metricValue: { color: runner.text, fontWeight: "800", fontSize: 13, textAlign: "center" },
  metricLabel: { color: runner.faint, fontSize: 10, textAlign: "center" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 6, width: "100%" },
  action: {
    flexGrow: 1,
    minWidth: "30%",
    minHeight: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: runner.line,
    padding: 6,
    gap: 4,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center"
  },
  actionText: { color: "#4a4d52", fontWeight: "800", fontSize: 11, textAlign: "center" },
  loadBtn: {
    minHeight: 42,
    width: "100%",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: runner.line,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8
  },
  loadText: { color: "#4a4d52", fontWeight: "800" },
  backLink: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", minHeight: 36, gap: 4 },
  backLinkText: { color: runner.coral, fontWeight: "800" },
  section: { color: runner.text, fontWeight: "800", fontSize: 16, marginTop: 8, alignSelf: "stretch", textAlign: "left" },
  muscleVisual: {
    width: "100%",
    minHeight: 160,
    borderRadius: 16,
    backgroundColor: "#e8ece8",
    alignItems: "center",
    justifyContent: "center"
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" },
  chip: { backgroundColor: "#eef6ef", color: runner.coral, fontWeight: "900", paddingHorizontal: 11, paddingVertical: 8, borderRadius: 999, overflow: "hidden" },
  label: { alignSelf: "stretch", color: runner.text, fontWeight: "900" },
  input: {
    width: "100%",
    minHeight: 58,
    borderWidth: 1,
    borderColor: runner.line,
    borderRadius: 14,
    paddingHorizontal: 16,
    color: runner.text,
    fontSize: 24,
    fontWeight: "900"
  },
  saveLoad: {
    minHeight: 54,
    width: "100%",
    borderRadius: 14,
    backgroundColor: runner.coral,
    alignItems: "center",
    justifyContent: "center"
  },
  saveLoadText: { color: runner.ink, fontWeight: "900" },
  startFace: { alignItems: "center", justifyContent: "center", gap: 1 },
  startCaption: { color: "rgba(228,192,120,0.88)", fontSize: 8, fontWeight: "700", textTransform: "uppercase", maxWidth: 56, textAlign: "center" },
  startStrong: { color: runner.mbGold, fontWeight: "800", fontSize: 11 },
  startTime: { color: runner.mbGold, fontSize: 22, fontWeight: "800" },
  disabled: { opacity: 0.4 },
  modalBack: { flex: 1, backgroundColor: "rgba(0,0,0,0.48)", alignItems: "center", justifyContent: "center", padding: 20 },
  modal: { width: "100%", maxWidth: 360, backgroundColor: "#fff", borderRadius: 16, padding: 22, gap: 12 },
  modalTitle: { color: "#2d2f33", fontSize: 22, fontWeight: "800", textAlign: "center" },
  modalCopy: { color: "#4f5157", fontSize: 16, lineHeight: 22, textAlign: "center" },
  modalRow: { flexDirection: "row", gap: 10 },
  yes: { flex: 1, minHeight: 44, borderRadius: 999, backgroundColor: runner.coral, alignItems: "center", justifyContent: "center" },
  yesText: { color: "#fff", fontWeight: "900" },
  no: { flex: 1, minHeight: 44, borderRadius: 999, borderWidth: 1, borderColor: "#d8d8d8", alignItems: "center", justifyContent: "center" },
  noText: { color: "#2d2f33", fontWeight: "900" },
  finishModal: { width: "100%", maxWidth: 366, backgroundColor: "#fff", borderRadius: 18, padding: 24, gap: 12, alignItems: "center" },
  trophy: {
    width: 86,
    height: 86,
    borderRadius: 24,
    backgroundColor: "rgba(242,180,97,0.22)",
    alignItems: "center",
    justifyContent: "center"
  },
  durationLabel: { color: "#4f5157", fontWeight: "800", fontSize: 15 },
  duration: { color: "#2d2f33", fontSize: 42, fontWeight: "800" },
  finishPrimary: { minHeight: 58, width: "100%", borderRadius: 14, backgroundColor: runner.coral, alignItems: "center", justifyContent: "center" },
  finishPrimaryText: { color: runner.ink, fontWeight: "900" },
  finishCancel: { minHeight: 58, width: "100%", borderRadius: 14, borderWidth: 1, borderColor: "#d6d6d8", alignItems: "center", justifyContent: "center" },
  finishCancelText: { color: "#3d3f45", fontWeight: "900" },
  noticeBack: { flex: 1, justifyContent: "flex-end", padding: 14, paddingBottom: 154 },
  notice: {
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 18,
    flexDirection: "row",
    gap: 18,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 6
  },
  noticeTitle: { color: "#303136", fontSize: 21, fontWeight: "800" },
  noticeCopy: { color: "#3d3f45", fontSize: 16, marginTop: 6 }
});
