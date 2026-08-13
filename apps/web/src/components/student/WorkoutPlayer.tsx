import { type CSSProperties, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  Expand,
  FileText,
  Pause,
  Play,
  Repeat,
  Share2,
  Target,
  Timer,
  Trophy,
  Wrench,
  X
} from "lucide-react";
import { mediaUrl as appMediaUrl } from "../../lib/urls";
import { uiSounds } from "../../lib/ui-sounds";

export type WorkoutStructureType =
  | "NORMAL"
  | "BI_SET"
  | "DROP_SET"
  | "REST_PAUSE"
  | "CIRCUIT"
  | "AMRAP"
  | "EMOM"
  | "FOR_TIME"
  | "TABATA"
  | "INTERVAL"
  | "CLASS";
export type WorkoutPrescriptionType = "REPETITIONS" | "DURATION" | "DISTANCE" | "INTERVAL" | "ROUNDS" | "HOLD" | "FREE";
export type WorkoutIntensityType = "NONE" | "LOAD" | "RPE" | "RIR" | "PERCENT_1RM" | "HEART_RATE_ZONE" | "PACE" | "SPEED";

export interface WorkoutPlayerExercise {
  prescriptionId: string;
  id: string;
  title: string;
  videoUrl: string;
  audioUrl?: string;
  materialUrl?: string;
  description?: string;
  targetMuscles?: string[];
  equipmentTags?: string[];
  sets: number;
  repsRange: string;
  prescriptionType: WorkoutPrescriptionType;
  repsMin?: number | null;
  repsMax?: number | null;
  durationSeconds?: number | null;
  distanceMeters?: number | null;
  rounds?: number | null;
  workSeconds?: number | null;
  intensityType?: WorkoutIntensityType;
  intensityValue?: string;
  tempo?: string;
  side?: string;
  executionNotes?: string;
  initialLoad?: string;
  restSeconds?: number;
  latestWeightUsed?: number;
  order: number;
  alternatives?: Array<{
    id: string;
    title: string;
    videoUrl: string;
    audioUrl?: string;
    materialUrl?: string;
  }>;
}

interface WorkoutSubstituteOption {
  id: string;
  title: string;
  videoUrl: string;
  audioUrl?: string;
  materialUrl?: string;
}

interface WorkoutPlayerProps {
  programTitle: string;
  blockTitle: string;
  exercises: WorkoutPlayerExercise[];
  restTimeDefault: number;
  structureType?: WorkoutStructureType;
  protocolRounds?: number | null;
  workSeconds?: number | null;
  timeCapSeconds?: number | null;
  instructions?: string | null;
  sessionId?: string | null;
  onBack: () => void;
  onWorkoutStart?: () => Promise<{ id: string } | void> | { id: string } | void;
  onCancelSession?: () => Promise<void> | void;
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
  onRequestSubstitutes?: (exerciseId: string) => Promise<WorkoutPlayerExercise["alternatives"] | void> | WorkoutPlayerExercise["alternatives"] | void;
  onWorkoutComplete?: () => Promise<void> | void;
}

type RunnerPanel = "sequence" | "run" | "execution" | "muscles" | "expand" | "video" | "load";
type RunnerPhase = "idle" | "active" | "rest";

const structureTypeLabels: Record<WorkoutStructureType, string> = {
  NORMAL: "Normal",
  BI_SET: "Bi-set",
  DROP_SET: "Drop-set",
  REST_PAUSE: "Rest-pause",
  CIRCUIT: "Circuito",
  AMRAP: "AMRAP",
  EMOM: "EMOM",
  FOR_TIME: "For time",
  TABATA: "Tabata",
  INTERVAL: "Intervalado",
  CLASS: "Aula guiada"
};

const dropSetMax = 2;
const restPauseRestSeconds = 15;

function formatElapsedTime(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  return [hours, minutes, seconds].map((item) => String(item).padStart(2, "0")).join(":");
}

function prescribedReps(exercise: WorkoutPlayerExercise) {
  if (exercise.repsMax) return exercise.repsMax;
  if (exercise.repsMin) return exercise.repsMin;
  const fixed = exercise.repsRange.trim().match(/^\d+$/);
  const range = exercise.repsRange.trim().match(/^\d+\s*[-–]\s*(\d+)$/);

  return fixed ? Number(fixed[0]) : range ? Number(range[1]) : 0;
}

function restPauseTargetReps(exercise: WorkoutPlayerExercise) {
  return Math.max(2, prescribedReps(exercise) * 2);
}

function parseLoad(value: string) {
  const match = value.replace(",", ".").match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function prescriptionLabel(exercise: WorkoutPlayerExercise) {
  if (exercise.prescriptionType === "DURATION") return `${exercise.durationSeconds ?? 0}s`;
  if (exercise.prescriptionType === "DISTANCE") return `${exercise.distanceMeters ?? 0} m`;
  if (exercise.prescriptionType === "INTERVAL") return `${exercise.sets}x ${exercise.workSeconds ?? 0}s`;
  if (exercise.prescriptionType === "ROUNDS") return `${exercise.rounds ?? exercise.sets} round(s)`;
  if (exercise.prescriptionType === "HOLD") return `${exercise.durationSeconds ?? 0}s${exercise.side ? ` - ${exercise.side}` : ""}`;

  return exercise.repsRange;
}

function intensityLabel(exercise: WorkoutPlayerExercise) {
  if (!exercise.intensityType || exercise.intensityType === "NONE") return exercise.initialLoad || "Livre";
  const labels: Record<Exclude<WorkoutIntensityType, "NONE">, string> = {
    LOAD: "Carga",
    RPE: "RPE",
    RIR: "RIR",
    PERCENT_1RM: "% de 1RM",
    HEART_RATE_ZONE: "Zona cardíaca",
    PACE: "Ritmo",
    SPEED: "Velocidade"
  };

  return `${labels[exercise.intensityType]}${exercise.intensityValue ? ` ${exercise.intensityValue}` : ""}`;
}

function resolveMediaUrl(path?: string | null) {
  return appMediaUrl(path);
}

function isImageMedia(url: string) {
  if (/^data:image\//i.test(url)) return true;
  const pathOnly = url.split(/[?#]/)[0] ?? url;
  return /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(pathOnly);
}

function isVideoMedia(url: string) {
  if (/^data:video\//i.test(url)) return true;
  if (isYouTubeUrl(url)) return true;
  if (isImageMedia(url)) return false;
  const pathOnly = url.split(/[?#]/)[0] ?? url;
  return /\.(mp4|webm|ogg|ogv|mov|m4v|mkv|mpg|mpeg|m3u8|ts)$/i.test(pathOnly);
}

function isYouTubeUrl(url: string) {
  return /^https?:\/\/(www\.)?(youtube\.com|youtu\.be|m\.youtube\.com)\//i.test(url);
}

function getYouTubeVideoId(url: string) {
  const match =
    url.match(/youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)([\w-]{11})/) ??
    url.match(/youtu\.be\/([\w-]{11})/);
  return match ? match[1] : "";
}

function getYouTubeEmbedUrl(url: string, options: { autoplay?: boolean; loop?: boolean; controls?: boolean } = {}) {
  const id = getYouTubeVideoId(url);
  if (!id) return "";
  const params = new URLSearchParams({ rel: "0" });
  if (options.autoplay) params.set("autoplay", "1");
  if (options.loop) {
    params.set("loop", "1");
    params.set("playlist", id);
  }
  params.set("controls", options.controls === false ? "0" : "1");
  return `https://www.youtube-nocookie.com/embed/${id}?${params.toString()}`;
}

function getYouTubeThumbnailUrl(url: string) {
  const id = getYouTubeVideoId(url);
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : "";
}

function mediaAlt(exercise: WorkoutPlayerExercise) {
  return `Mídia do exercício ${exercise.title}`;
}

function exerciseInstanceKey(exercise: WorkoutPlayerExercise) {
  return `${exercise.id}-${exercise.order}`;
}

function instructionSteps(exercise: WorkoutPlayerExercise) {
  const equipment = (exercise.equipmentTags ?? []).join(", ");

  return [
    `Prepare a posição inicial para ${exercise.title}${equipment ? ` usando ${equipment}` : ""}.`,
    "Mantenha controle do movimento, postura firme e respiração constante.",
    `Execute ${prescriptionLabel(exercise)} conforme prescrito no treino.`,
    ...(exercise.executionNotes ? [exercise.executionNotes] : []),
    "Finalize a série sem soltar a carga bruscamente e aguarde o descanso configurado."
  ];
}

function MediaBlock({ exercise, expanded = false, resting = false, lesson = false }: { exercise: WorkoutPlayerExercise; expanded?: boolean; resting?: boolean; lesson?: boolean }) {
  const mediaUrl = resolveMediaUrl(exercise.videoUrl);
  const youtubeEmbedUrl = isYouTubeUrl(mediaUrl) ? getYouTubeEmbedUrl(mediaUrl, lesson ? { autoplay: true, loop: true } : {}) : "";
  const youtubeThumbUrl = isYouTubeUrl(mediaUrl) ? getYouTubeThumbnailUrl(mediaUrl) : "";

  return (
    <div className={`runner-focus-media ${expanded ? "expanded" : ""} ${resting ? "resting" : ""}`}>
      {resting ? (
        <Timer size={74} />
      ) : youtubeEmbedUrl ? (
        expanded ? (
          <iframe
            src={youtubeEmbedUrl}
            title={mediaAlt(exercise)}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        ) : (
          <img src={youtubeThumbUrl} alt={mediaAlt(exercise)} />
        )
      ) : mediaUrl ? (
        isVideoMedia(mediaUrl) && !isImageMedia(mediaUrl) ? (
          <video
            src={mediaUrl}
            controls={expanded}
            autoPlay={lesson}
            loop={lesson || !expanded}
            muted={!expanded}
            playsInline
          />
        ) : (
          <img src={mediaUrl} alt={mediaAlt(exercise)} />
        )
      ) : (
        <Dumbbell size={74} />
      )}
    </div>
  );
}

export function WorkoutPlayer({
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
  onExerciseProgressChange,
  onRequestSubstitutes,
  onWorkoutComplete
}: WorkoutPlayerProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(sessionId ?? null);
  const [panel, setPanel] = useState<RunnerPanel>("sequence");
  const [phase, setPhase] = useState<RunnerPhase>("idle");
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [currentSet, setCurrentSet] = useState(1);
  const [restRemaining, setRestRemaining] = useState(0);
  const [advanceAfterRest, setAdvanceAfterRest] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [lastExerciseNoticeOpen, setLastExerciseNoticeOpen] = useState(false);
  const [workoutReadyToComplete, setWorkoutReadyToComplete] = useState(false);
  const [completedIds, setCompletedIds] = useState<Set<string>>(() => new Set());
  const [dayCompleted, setDayCompleted] = useState(false);
  const [loads, setLoads] = useState<Record<string, string>>(() =>
    Object.fromEntries(exercises.map((exercise) => [exerciseInstanceKey(exercise), exercise.latestWeightUsed ? String(exercise.latestWeightUsed) : exercise.initialLoad ?? ""]))
  );
  const [actualReps, setActualReps] = useState<Record<string, string>>(() =>
    Object.fromEntries(exercises.map((exercise) => [exerciseInstanceKey(exercise), prescribedReps(exercise) ? String(prescribedReps(exercise)) : ""]))
  );
  const [perceivedEffort, setPerceivedEffort] = useState<Record<string, string>>({});
  const [substitutions, setSubstitutions] = useState<Record<string, WorkoutSubstituteOption>>({});
  const [substituteOpen, setSubstituteOpen] = useState(false);
  const [substituteLoading, setSubstituteLoading] = useState(false);
  const [substituteOptions, setSubstituteOptions] = useState<WorkoutSubstituteOption[]>([]);
  const [dropCount, setDropCount] = useState(0);
  const [restPauseAccum, setRestPauseAccum] = useState(0);

  const currentExercise = exercises[currentExerciseIndex] ?? exercises[0];
  const currentExerciseKey = currentExercise ? exerciseInstanceKey(currentExercise) : "";
  const currentLoad = currentExerciseKey ? (loads[currentExerciseKey] ?? "") : "";
  const isBiSet = structureType === "BI_SET";
  const isDropSet = structureType === "DROP_SET";
  const isRestPause = structureType === "REST_PAUSE";
  const isDropRound = isDropSet && dropCount > 0;
  const pairBaseIndex = currentExerciseIndex % 2 === 1 ? currentExerciseIndex - 1 : currentExerciseIndex;
  const pairMateIndex = currentExerciseIndex % 2 === 0 ? currentExerciseIndex + 1 : currentExerciseIndex - 1;
  const pairHasMate = pairMateIndex >= 0 && pairMateIndex < exercises.length;
  const currentRestSeconds =
    isDropRound
      ? Math.min(restTimeDefault, 20)
      : isRestPause
        ? restPauseRestSeconds
        : (currentExercise?.restSeconds ?? restTimeDefault);
  const clusterReps = Math.max(1, currentExercise ? prescribedReps(currentExercise) : 0);
  const clusterCount = Math.max(1, Math.ceil((currentExercise ? restPauseTargetReps(currentExercise) : 0) / clusterReps));
  const completedClusters = Math.min(clusterCount, Math.floor(restPauseAccum / clusterReps));
  const completedExerciseCount = completedIds.size;
  const allCompleted = exercises.length > 0 && completedExerciseCount === exercises.length;
  const restPercent = currentRestSeconds > 0 ? Math.max(0, Math.min(100, (restRemaining / currentRestSeconds) * 100)) : 0;
  const muscles = useMemo(() => currentExercise?.targetMuscles ?? [], [currentExercise]);
  const equipment = useMemo(() => currentExercise?.equipmentTags ?? [], [currentExercise]);

  function resolveExercise(exercise: WorkoutPlayerExercise): WorkoutPlayerExercise {
    const substitution = substitutions[exerciseInstanceKey(exercise)];

    if (!substitution) {
      return exercise;
    }

    return {
      ...exercise,
      title: substitution.title,
      videoUrl: substitution.videoUrl,
      audioUrl: substitution.audioUrl,
      materialUrl: substitution.materialUrl
    };
  }

  function showLastExerciseNotice() {
    setLastExerciseNoticeOpen(false);
    window.setTimeout(() => setLastExerciseNoticeOpen(true), 0);
  }

  useEffect(() => {
    setActiveSessionId(sessionId ?? null);
  }, [sessionId]);

  useEffect(() => {
    setLoads(
      Object.fromEntries(exercises.map((exercise) => [exerciseInstanceKey(exercise), exercise.latestWeightUsed ? String(exercise.latestWeightUsed) : exercise.initialLoad ?? ""]))
    );
    setActualReps(
      Object.fromEntries(exercises.map((exercise) => [exerciseInstanceKey(exercise), prescribedReps(exercise) ? String(prescribedReps(exercise)) : ""]))
    );
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
    setSubstitutions({});
    setSubstituteOpen(false);
    setSubstituteOptions([]);
    setDropCount(0);
    setRestPauseAccum(0);
  }, [exercises]);

  useEffect(() => {
    if (!isRunning || isPaused) return;

    const interval = window.setInterval(() => {
      setElapsedSeconds((current) => current + 1);
    }, 1000);

    return () => window.clearInterval(interval);
  }, [isPaused, isRunning]);

  useEffect(() => {
    if (phase !== "rest" || isPaused || restRemaining <= 0) return;

    const interval = window.setInterval(() => {
      setRestRemaining((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [isPaused, phase, restRemaining]);

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

    const timeout = window.setTimeout(() => {
      setLastExerciseNoticeOpen(false);
    }, 2000);

    return () => window.clearTimeout(timeout);
  }, [lastExerciseNoticeOpen]);

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
      const session = await onWorkoutStart?.();
      const nextSessionId = session?.id ?? null;
      setActiveSessionId(nextSessionId);
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

  async function saveExerciseProgress(exercise: WorkoutPlayerExercise, completedSets: number, sessionIdForProgress?: string | null) {
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

  async function toggleSequenceExercise(exercise: WorkoutPlayerExercise) {
    const instanceKey = exerciseInstanceKey(exercise);
    const nextCompleted = !completedIds.has(instanceKey);
    let sessionIdForProgress = activeSessionId;

    if (nextCompleted && !sessionIdForProgress) {
      sessionIdForProgress = await startWorkout(false);

      if (!sessionIdForProgress) {
        return;
      }
    }

    const nextCompletedIds = new Set(completedIds);

    if (nextCompleted) {
      uiSounds.itemSelect();
      nextCompletedIds.add(instanceKey);
    } else {
      uiSounds.itemDeselect();
      nextCompletedIds.delete(instanceKey);
      setDayCompleted(false);
      setFinishOpen(false);
      setWorkoutReadyToComplete(false);
    }

    setCompletedIds(nextCompletedIds);

    try {
      await onExerciseProgressChange?.({
        sessionId: sessionIdForProgress ?? activeSessionId,
        exerciseId: exercise.id,
        prescriptionId: exercise.prescriptionId,
        completed: nextCompleted,
        weightUsed: parseLoad(loads[instanceKey] || ""),
        repsCompleted: Math.max(0, Number(actualReps[instanceKey]) || 0),
        sets: exercise.sets,
        durationSeconds: exercise.durationSeconds ?? exercise.workSeconds ?? undefined,
        distanceMeters: exercise.distanceMeters ?? undefined,
        roundsCompleted: exercise.rounds ?? undefined,
        perceivedExertion: perceivedEffort[instanceKey] ? Number(perceivedEffort[instanceKey]) : undefined,
        notes: exercise.executionNotes || undefined
      });
    } catch {
      setCompletedIds(completedIds);
    }
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
      setSubstituteOpen(false);
      setPanel("run");
      setPhase("active");
      if (nextIndex === exercises.length - 1) {
        showLastExerciseNotice();
      }
      return;
    }

    setPhase("idle");
    setIsRunning(false);
    setIsPaused(false);
    setAdvanceAfterRest(false);
    setDropCount(0);
    setRestPauseAccum(0);
    setSubstituteOpen(false);
    setWorkoutReadyToComplete(true);
    setFinishOpen(true);
    uiSounds.popupOpen();
  }

  async function completeSet() {
    let sessionIdForProgress = activeSessionId;

    if (!isRunning || !sessionIdForProgress) {
      sessionIdForProgress = await startWorkout();

      if (!sessionIdForProgress) {
        return;
      }
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
      setPhase("rest");
      setRestRemaining(currentRestSeconds);
      return;
    }

    if (isRestPause) {
      const nextAccum = restPauseAccum + prescribedReps(currentExercise);
      setRestPauseAccum(nextAccum);
      const setComplete = nextAccum >= restPauseTargetReps(currentExercise);
      setAdvanceAfterRest(setComplete && currentSet >= exerciseSets);
      setPhase("rest");
      setRestRemaining(currentRestSeconds);
      return;
    }

    setAdvanceAfterRest(currentSet >= exerciseSets);
    setPhase("rest");
    setRestRemaining(currentRestSeconds);
  }

  function finishRestNow() {
    if (phase !== "rest") return;

    setRestRemaining(0);
  }

  async function saveLoad() {
    let sessionIdForProgress = activeSessionId;

    if (!sessionIdForProgress) {
      sessionIdForProgress = await startWorkout();
    }

    if (!sessionIdForProgress || !currentExercise) return;

    await saveExerciseProgress(currentExercise, Math.max(1, currentSet - (phase === "rest" ? 0 : 1)), sessionIdForProgress);
    setPanel("run");
  }

  async function confirmCancel() {
    await onCancelSession?.();
    setCancelOpen(false);
    onBack();
  }

  function handleHeaderBack() {
    if (isRunning) {
      if (panel === "sequence") {
        setCancelOpen(true);
        uiSounds.popupOpen();
        return;
      }

      setCancelOpen(false);
      setPanel("sequence");
      return;
    }

    onBack();
  }

  function handleRunnerCancelButton() {
    if (isRunning) {
      setCancelOpen(true);
      uiSounds.popupOpen();
      return;
    }

    onBack();
  }

  function openExerciseFromSequence(index: number) {
    setCurrentExerciseIndex(index);
    setCurrentSet(1);
    setDropCount(0);
    setRestPauseAccum(0);
    setSubstituteOpen(false);
    setPanel("run");
    setPhase((current) => (isRunning && current === "idle" ? "active" : current));
  }

  function openSubstituteModal() {
    if (!currentExercise) return;

    const localOptions: WorkoutSubstituteOption[] = (currentExercise.alternatives ?? []).map((alternative) => ({
      id: alternative.id,
      title: alternative.title,
      videoUrl: alternative.videoUrl,
      audioUrl: alternative.audioUrl,
      materialUrl: alternative.materialUrl
    }));
    setSubstituteOptions(localOptions);
    setSubstituteOpen(true);
    uiSounds.popupOpen();

    if (localOptions.length === 0) {
      void loadSubstitutes();
    }
  }

  async function loadSubstitutes() {
    if (!currentExercise || substituteLoading) return;

    setSubstituteLoading(true);
    try {
      const remote = (await onRequestSubstitutes?.(currentExercise.id)) ?? [];
      const remoteOptions: WorkoutSubstituteOption[] = remote.map((alternative) => ({
        id: alternative.id,
        title: alternative.title,
        videoUrl: alternative.videoUrl,
        audioUrl: alternative.audioUrl,
        materialUrl: alternative.materialUrl
      }));
      setSubstituteOptions((current) => {
        const knownIds = new Set(current.map((item) => item.id));
        return [...current, ...remoteOptions.filter((item) => !knownIds.has(item.id))];
      });
    } finally {
      setSubstituteLoading(false);
    }
  }

  function applySubstitution(option: WorkoutSubstituteOption) {
    if (!currentExercise) return;

    setSubstitutions((current) => ({
      ...current,
      [exerciseInstanceKey(currentExercise)]: option
    }));
    setSubstituteOpen(false);
  }

  async function completeWorkout() {
    if (!workoutReadyToComplete || !allCompleted || dayCompleted) return;

    uiSounds.submit();
    setDayCompleted(true);
    try {
      await onWorkoutComplete?.();
      uiSounds.workoutComplete();
      setIsRunning(false);
      setIsPaused(false);
      setElapsedSeconds(0);
      setCompletedIds(new Set());
      setActiveSessionId(null);
      setFinishOpen(false);
      setShareOpen(false);
      setWorkoutReadyToComplete(false);
    } catch {
      uiSounds.error();
      setDayCompleted(false);
    }
  }

  function openSharePrompt() {
    setIsRunning(false);
    setIsPaused(true);
    setFinishOpen(false);
    setShareOpen(true);
    uiSounds.popupOpen();
  }

  async function shareWorkout() {
    const shareData = {
      title: "O TREINO DE HOJE TÁ PAGO!",
      text: "Acabei de concluir meu treino no App Treino."
    };

    if (navigator.share) {
      await navigator.share(shareData);
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(shareData.text);
    }
  }

  if (exercises.length === 0 || !currentExercise) {
    return <div className="workout-player-empty">Nenhum exercício carregado.</div>;
  }

  const resolvedCurrentExercise = resolveExercise(currentExercise);
  const executionSteps = instructionSteps(resolvedCurrentExercise);
  const currentVideoUrl = isVideoMedia(resolveMediaUrl(resolvedCurrentExercise.videoUrl)) ? resolveMediaUrl(resolvedCurrentExercise.videoUrl) : "";

  return (
    <div className="workout-runner">
      <header className="workout-runner-header">
        <button aria-label="Voltar para treinos" onClick={handleHeaderBack}>
          <ArrowLeft size={28} />
        </button>
        <div>
          <strong>Execução</strong>
          <span><Timer size={20} />{formatElapsedTime(elapsedSeconds)}</span>
        </div>
        <button aria-label={isPaused ? "Retomar cronômetro" : "Pausar cronômetro"} onClick={() => isRunning && setIsPaused((current) => !current)} disabled={!isRunning}>
          {isPaused || !isRunning ? <Play size={26} /> : <Pause size={26} />}
        </button>
      </header>

      <main className={`workout-runner-body ${panel === "run" ? "in-run" : ""}`}>
        {panel === "sequence" && (
          <section className="runner-sequence-page">
            <div className="workout-runner-summary">
              <span>{programTitle}</span>
              <strong>{exercises.length} exercício(s)</strong>
              {structureType !== "NORMAL" && <small className="runner-mode-badge">{structureTypeLabels[structureType]}</small>}
              {(protocolRounds || workSeconds || timeCapSeconds) && (
                <small>
                  {[
                    protocolRounds ? `${protocolRounds} round(s)` : "",
                    workSeconds ? `${workSeconds}s de trabalho` : "",
                    timeCapSeconds ? `limite ${formatElapsedTime(timeCapSeconds)}` : ""
                  ].filter(Boolean).join(" | ")}
                </small>
              )}
            </div>
            {exercises.map((exercise, index) => {
              const resolvedExercise = resolveExercise(exercise);
              const instanceKey = exerciseInstanceKey(exercise);
              const selected = index === currentExerciseIndex;
              const musclesText = (resolvedExercise.targetMuscles ?? []).join(", ") || "Grupo muscular não informado";
              const mediaUrl = resolveMediaUrl(resolvedExercise.videoUrl);

              return (
                <article className={`workout-runner-card ${selected ? "selected" : ""}`} key={instanceKey}>
                  <div className="runner-exercise-main runner-sequence-card-button" onClick={() => setCurrentExerciseIndex(index)}>
                    <div className="runner-media">
                      {mediaUrl ? (
                        isYouTubeUrl(mediaUrl) ? (
                          <img src={getYouTubeThumbnailUrl(mediaUrl)} alt={mediaAlt(resolvedExercise)} onClick={() => openExerciseFromSequence(index)} />
                        ) : isVideoMedia(mediaUrl) && !isImageMedia(mediaUrl) ? (
                          <video src={mediaUrl} muted playsInline onClick={() => openExerciseFromSequence(index)} />
                        ) : (
                          <img src={mediaUrl} alt={mediaAlt(resolvedExercise)} onClick={() => openExerciseFromSequence(index)} />
                        )
                      ) : (
                        <button className="runner-media-button" type="button" onClick={() => openExerciseFromSequence(index)} aria-label={`Abrir ${resolvedExercise.title}`}>
                          <Trophy size={28} />
                        </button>
                      )}
                    </div>
                    <div className="runner-exercise-copy">
                      <button type="button" onClick={() => openExerciseFromSequence(index)}>
                        {resolvedExercise.title}
                      </button>
                      <span>{musclesText}</span>
                      <small>
                        {resolvedExercise.sets} série(s)/ciclo(s) | {prescriptionLabel(resolvedExercise)} | {resolvedExercise.restSeconds ?? restTimeDefault}s
                      </small>
                    </div>
                    <button
                      className={`runner-toggle ${completedIds.has(instanceKey) ? "checked" : ""}`}
                      aria-label={completedIds.has(instanceKey) ? "Desmarcar treino concluído" : "Marcar treino concluído"}
                      onClick={(event) => {
                        event.stopPropagation();
                        void toggleSequenceExercise(exercise);
                      }}
                      type="button"
                    >
                      <span>{completedIds.has(instanceKey) ? <Check size={18} /> : index + 1}</span>
                    </button>
                  </div>
                </article>
              );
            })}
          </section>
        )}

        {panel === "run" && (
          <article className="runner-focus-card">
            <h1>{resolvedCurrentExercise.title}</h1>
            <div className="runner-set-pill">
              <span>Séries/ciclos: <strong>{currentExercise.sets}</strong></span>
              {isBiSet && <span>Bi-set <strong>1A + 1B</strong></span>}
              {isDropRound && <span>Drop <strong>{dropCount}/{dropSetMax}</strong></span>}
              {isRestPause && <span>Clusters <strong>{completedClusters}/{clusterCount}</strong></span>}
              <span>Descanso: <strong>{currentRestSeconds}s</strong></span>
            </div>
            <MediaBlock exercise={resolvedCurrentExercise} resting={phase === "rest"} />
            {resolvedCurrentExercise.audioUrl && (
              <div className="runner-audio">
                <audio src={resolveMediaUrl(resolvedCurrentExercise.audioUrl)} controls preload="none" />
              </div>
            )}
            <div className="runner-set-track" aria-label="Séries do exercício">
              {isDropSet
                ? Array.from({ length: currentExercise.sets + dropSetMax }).map((_, index) => {
                    const setNumber = index + 1;
                    const isDropSlot = setNumber > currentExercise.sets;
                    const dropSlotIndex = setNumber - currentExercise.sets;
                    const complete = isDropSlot ? dropCount >= dropSlotIndex : setNumber < currentSet || completedIds.has(currentExerciseKey);
                    const active = !complete && (isDropSlot ? dropCount === dropSlotIndex - 1 && currentSet >= currentExercise.sets : setNumber === currentSet);

                    return (
                      <span className={`${complete ? "complete" : ""} ${active ? phase : ""} ${isDropSlot ? "drop-slot" : ""}`} key={setNumber}>
                        {complete ? <Check size={22} /> : isDropSlot ? "D" : setNumber}
                      </span>
                    );
                  })
                : isRestPause
                  ? Array.from({ length: clusterCount }).map((_, index) => {
                      const clusterNumber = index + 1;
                      const complete = clusterNumber <= completedClusters || completedIds.has(currentExerciseKey);
                      const active = clusterNumber === completedClusters + 1 && !complete;

                      return (
                        <span className={`${complete ? "complete" : ""} ${active ? phase : ""}`} key={clusterNumber}>
                          {complete ? <Check size={22} /> : clusterNumber}
                        </span>
                      );
                    })
                  : Array.from({ length: currentExercise.sets }).map((_, index) => {
                      const setNumber = index + 1;
                      const complete = setNumber < currentSet || completedIds.has(currentExerciseKey);
                      const active = setNumber === currentSet && !complete;

                      return (
                        <span className={`${complete ? "complete" : ""} ${active ? phase : ""}`} key={setNumber}>
                          {complete ? <Check size={22} /> : setNumber}
                        </span>
                      );
                    })}
            </div>
            <div className="runner-current-metrics">
              <div>
                <strong>{prescriptionLabel(resolvedCurrentExercise)}</strong>
                <span>{isRestPause ? "Repetições por cluster" : isDropRound ? "Repetições até a falha" : "Alvo prescrito"}</span>
              </div>
              <div>
                <strong>{currentLoad || intensityLabel(resolvedCurrentExercise)}</strong>
                <span>{isDropRound ? "Carga reduzida" : "Intensidade"}</span>
              </div>
            </div>
            <div className="runner-action-grid">
              <button onClick={() => setPanel("execution")}>
                <FileText size={18} />
                <span>Execução</span>
              </button>
              <button onClick={() => setPanel("muscles")}>
                <Target size={18} />
                <span>Músculos</span>
              </button>
              <button onClick={() => setPanel("expand")}>
                <Expand size={18} />
                <span>Ampliar</span>
              </button>
              {currentVideoUrl && (
                <button onClick={() => setPanel("video")}>
                  <Play size={18} />
                  <span>Aula em vídeo</span>
                </button>
              )}
              {resolvedCurrentExercise.materialUrl && (
                <button onClick={() => window.open(resolveMediaUrl(resolvedCurrentExercise.materialUrl), "_blank", "noopener,noreferrer")}>
                  <FileText size={18} />
                  <span>Material</span>
                </button>
              )}
              <button onClick={openSubstituteModal}>
                <Repeat size={18} />
                <span>Substituir</span>
              </button>
            </div>
            <button className="runner-load-button" onClick={() => setPanel("load")}>
              <Wrench size={18} />
              Registrar execução
            </button>
          </article>
        )}

        {panel === "execution" && (
          <article className="runner-detail-page">
            <button className="runner-back-link" onClick={() => setPanel("run")}>
              <ChevronLeft size={20} />
              Voltar
            </button>
            <header>
              <div>
                <h1>{resolvedCurrentExercise.title}</h1>
                <p>{equipment.length ? `Equipamentos: ${equipment.join(", ")}` : "Use a técnica indicada pelo professor para este exercício."}</p>
              </div>
              <MediaBlock exercise={resolvedCurrentExercise} />
            </header>
            <section>
              <h2>Descrição</h2>
              <p>{resolvedCurrentExercise.description || (muscles.length ? `Exercício focado em ${muscles.join(", ")}.` : "Descrição técnica ainda não cadastrada.")}</p>
            </section>
            <section>
              <h2>Instrução de execução</h2>
              <ol>
                {executionSteps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </section>
            {instructions && (
              <section>
                <h2>Orientação da sessão</h2>
                <p>{instructions}</p>
              </section>
            )}
            {resolvedCurrentExercise.videoUrl && (
              <section>
                <h2>Vídeo explicativo</h2>
                <MediaBlock exercise={resolvedCurrentExercise} expanded />
              </section>
            )}
            {resolvedCurrentExercise.audioUrl && (
              <section>
                <h2>Áudio de orientação</h2>
                <div className="runner-audio">
                  <audio src={resolveMediaUrl(resolvedCurrentExercise.audioUrl)} controls preload="none" />
                </div>
              </section>
            )}
            {resolvedCurrentExercise.materialUrl && (
              <section>
                <h2>Material de apoio</h2>
                <button className="runner-save-load" onClick={() => window.open(resolveMediaUrl(resolvedCurrentExercise.materialUrl), "_blank", "noopener,noreferrer")}>
                  <FileText size={18} />
                  Abrir material
                </button>
              </section>
            )}
          </article>
        )}

        {panel === "muscles" && (
          <article className="runner-detail-page">
            <button className="runner-back-link" onClick={() => setPanel("run")}>
              <ChevronLeft size={20} />
              Voltar
            </button>
            <h1>{resolvedCurrentExercise.title}</h1>
            <div className="runner-muscle-visual">
              <Target size={84} />
            </div>
            <section>
              <h2>Músculos</h2>
              {muscles.length ? (
                <div className="runner-chip-list">
                  {muscles.map((muscle) => (
                    <span key={muscle}>{muscle}</span>
                  ))}
                </div>
              ) : (
                <p>Músculos alvo ainda não cadastrados.</p>
              )}
            </section>
          </article>
        )}

        {panel === "expand" && (
          <article className="runner-detail-page">
            <button className="runner-back-link" onClick={() => setPanel("run")}>
              <ChevronLeft size={20} />
              Voltar
            </button>
            <h1>{resolvedCurrentExercise.title}</h1>
            <MediaBlock exercise={resolvedCurrentExercise} expanded />
            <section>
              <h2>Instrução de execução</h2>
              <ol>
                {executionSteps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </section>
          </article>
        )}

        {panel === "video" && (
          <article className="runner-detail-page runner-video-lesson">
            <button className="runner-back-link" onClick={() => setPanel("run")}>
              <ChevronLeft size={20} />
              Voltar ao exercício
            </button>
            <header>
              <h1>{resolvedCurrentExercise.title}</h1>
              <p>Aula em vídeo do treino — assista com atenção à execução antes de realizar as séries.</p>
            </header>
            <MediaBlock exercise={resolvedCurrentExercise} expanded lesson />
            <section>
              <h2>Descrição</h2>
              <p>{resolvedCurrentExercise.description || (muscles.length ? `Exercício focado em ${muscles.join(", ")}.` : "Descrição técnica ainda não cadastrada.")}</p>
            </section>
            {resolvedCurrentExercise.audioUrl && (
              <section>
                <h2>Áudio de orientação</h2>
                <div className="runner-audio">
                  <audio src={resolveMediaUrl(resolvedCurrentExercise.audioUrl)} controls preload="none" />
                </div>
              </section>
            )}
            {resolvedCurrentExercise.materialUrl && (
              <section>
                <h2>Material de apoio</h2>
                <button className="runner-save-load" onClick={() => window.open(resolveMediaUrl(resolvedCurrentExercise.materialUrl), "_blank", "noopener,noreferrer")}>
                  <FileText size={18} />
                  Abrir material
                </button>
              </section>
            )}
          </article>
        )}

        {panel === "load" && (
          <article className="runner-detail-page runner-load-page">
            <button className="runner-back-link" onClick={() => setPanel("run")}>
              <ChevronLeft size={20} />
              Voltar
            </button>
            <h1>Registrar execução</h1>
            <p>{resolvedCurrentExercise.title}</p>
            <label>
              {isDropRound ? "Carga reduzida no drop" : "Carga utilizada"}
              <input
                type="text"
                inputMode="decimal"
                value={currentLoad}
                onChange={(event) => setLoads((current) => ({ ...current, [currentExerciseKey]: event.target.value }))}
                placeholder="Ex.: 20 kg"
              />
            </label>
            {resolvedCurrentExercise.prescriptionType === "REPETITIONS" && (
              <label>
                Repetições realizadas
                <input
                  type="number"
                  min="0"
                  inputMode="numeric"
                  value={actualReps[currentExerciseKey] ?? ""}
                  onChange={(event) => setActualReps((current) => ({ ...current, [currentExerciseKey]: event.target.value }))}
                  placeholder="0"
                />
              </label>
            )}
            <label>
              Esforço percebido (0 a 10)
              <input
                type="number"
                min="0"
                max="10"
                step="0.5"
                inputMode="decimal"
                value={perceivedEffort[currentExerciseKey] ?? ""}
                onChange={(event) => setPerceivedEffort((current) => ({ ...current, [currentExerciseKey]: event.target.value }))}
                placeholder="Opcional"
              />
            </label>
            <button className="runner-save-load" onClick={() => void saveLoad()}>
              <Wrench size={18} />
              Salvar execução
            </button>
          </article>
        )}
      </main>

      <footer className="workout-runner-controls">
        {panel === "run" ? (
          <button
            className="runner-round-button"
            aria-label="Exercício anterior"
            onClick={() => {
              if (currentExerciseIndex > 0) {
                setCurrentExerciseIndex((index) => index - 1);
                setCurrentSet(1);
                setRestRemaining(0);
                setAdvanceAfterRest(false);
                setDropCount(0);
                setRestPauseAccum(0);
                setSubstituteOpen(false);
                setPhase("active");
                return;
              }

              setCurrentSet(1);
              setRestRemaining(0);
              setAdvanceAfterRest(false);
              setDropCount(0);
              setRestPauseAccum(0);
              setSubstituteOpen(false);
              setPhase("idle");
              if (isRunning) {
                setCancelOpen(true);
        uiSounds.popupOpen();
                return;
              }
              onBack();
            }}
            disabled={phase === "rest"}
          >
            <ChevronLeft size={24} />
          </button>
        ) : (
          <button
            className="runner-round-button"
            aria-label="Cancelar treino"
            onClick={handleRunnerCancelButton}
          >
            <X size={24} />
          </button>
        )}
        <button
          className={`runner-start-button ${phase === "rest" ? "resting" : ""}`}
          aria-label={phase === "rest" ? "Descanso em andamento" : isRunning ? "Treino Realizado" : "Iniciar sequência do treino"}
          onClick={() => {
            if (panel === "sequence") {
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
          }}
          disabled={isStarting || dayCompleted}
          style={phase === "rest" ? ({ "--rest-progress": `${restPercent}%` } as CSSProperties) : undefined}
        >
          {phase === "rest" ? (
            <>
              <strong>{restRemaining}</strong>
              <span>Concluir descanso</span>
            </>
          ) : isDropRound ? (
            <>
              <strong>DROP {dropCount}/{dropSetMax}</strong>
              <span>Concluir</span>
            </>
          ) : isRestPause ? (
            <>
              <Check size={38} />
              <span>Cluster {completedClusters + 1}/{clusterCount}</span>
            </>
          ) : (
            <>
              {isRunning && panel !== "sequence" ? <Check size={38} /> : <Trophy size={32} />}
              <span>{isStarting ? "Iniciando" : isRunning && panel !== "sequence" ? "Realizado" : "Iniciar"}</span>
            </>
          )}
        </button>
        {panel === "run" ? (
          <button
            className="runner-round-button"
            aria-label="Próximo exercício"
            onClick={() => {
              if (currentExerciseIndex < exercises.length - 1) {
                const nextIndex = currentExerciseIndex + 1;
                setCurrentExerciseIndex(nextIndex);
                setCurrentSet(1);
                setRestRemaining(0);
                setAdvanceAfterRest(false);
                setDropCount(0);
                setRestPauseAccum(0);
                setSubstituteOpen(false);
                setPhase("active");
                if (nextIndex === exercises.length - 1) {
                  showLastExerciseNotice();
                }
                return;
              }

              showLastExerciseNotice();
            }}
            disabled={phase === "rest"}
          >
            <ChevronRight size={24} />
          </button>
        ) : (
          <button
            className="runner-round-button"
            aria-label={isRunning ? (isPaused ? "Retomar cronômetro" : "Pausar cronômetro") : "Cronômetro aguardando início"}
            onClick={() => {
              if (isRunning) {
                setIsPaused((current) => !current);
              }
            }}
            disabled={!isRunning}
          >
            {!isRunning || isPaused ? <Play size={24} /> : <Pause size={24} />}
          </button>
        )}
      </footer>

      {cancelOpen && (
        <div className="runner-confirm-backdrop" role="presentation" onClick={() => {
          uiSounds.popupClose();
          setCancelOpen(false);
        }}>
          <section className="runner-confirm-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <h2>Deseja cancelar o treino?</h2>
            <p>Ao confirmar, a execução atual será cancelada.</p>
            <div>
              <button className="confirm-yes" onClick={() => {
                uiSounds.void();
                void confirmCancel();
              }}>
                SIM
              </button>
              <button className="confirm-no" onClick={() => {
                uiSounds.popupClose();
                setCancelOpen(false);
              }}>
                Não
              </button>
            </div>
          </section>
        </div>
      )}

      {substituteOpen && currentExercise && (
        <div className="runner-confirm-backdrop" role="presentation" onClick={() => setSubstituteOpen(false)}>
          <section className="runner-substitute-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <h2>Substituir exercício</h2>
            <p>{resolvedCurrentExercise.title}</p>
            <div className="runner-substitute-list">
              {substituteLoading ? (
                <span className="runner-substitute-empty">Buscando alternativas...</span>
              ) : substituteOptions.length > 0 ? (
                substituteOptions.map((option) => (
                  <button type="button" key={option.id} onClick={() => applySubstitution(option)}>
                    <span>{option.title}</span>
                    <small>{option.videoUrl ? "Com mídia" : "Sem mídia"}</small>
                  </button>
                ))
              ) : (
                <span className="runner-substitute-empty">Nenhuma alternativa encontrada.</span>
              )}
            </div>
            {substituteOptions.length > 0 && (
              <button className="runner-substitute-refresh" type="button" onClick={() => void loadSubstitutes()} disabled={substituteLoading}>
                Buscar mais alternativas
              </button>
            )}
            <button className="runner-substitute-cancel" type="button" onClick={() => setSubstituteOpen(false)}>
              Fechar
            </button>
          </section>
        </div>
      )}

      {finishOpen && (
        <div className="runner-confirm-backdrop" role="presentation" onClick={() => setFinishOpen(false)}>
          <section className="runner-finish-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="runner-finish-trophy" aria-hidden="true">
              <Trophy size={62} />
            </div>
            <h2>PARABÉNS, TREINO CONCLUÍDO</h2>
            <p>Um passo de cada vez e você vai conquistar todos os seus objetivos. Bom descanso e até o próximo treino!</p>
            <div className="runner-finish-duration">
              <span>Duração do treino</span>
              <strong>{formatElapsedTime(elapsedSeconds)}</strong>
            </div>
            <button className="runner-finish-primary" onClick={openSharePrompt} disabled={dayCompleted}>
              FINALIZAR O TREINO
            </button>
            <button className="runner-finish-cancel" onClick={() => setFinishOpen(false)}>
              CANCELAR
            </button>
          </section>
        </div>
      )}

      {lastExerciseNoticeOpen && (
        <div className="runner-bottom-notice-backdrop" role="presentation" onClick={() => setLastExerciseNoticeOpen(false)}>
          <section className="runner-bottom-notice" role="status" aria-live="polite" onClick={(event) => event.stopPropagation()}>
            <div className="runner-notice-icon" aria-hidden="true">
              <AlertTriangle size={46} />
            </div>
            <div>
              <h2>Atenção</h2>
              <p>Esse é o último exercício do seu treino!</p>
            </div>
          </section>
        </div>
      )}

      {shareOpen && (
        <div className="runner-confirm-backdrop" role="presentation">
          <section className="runner-share-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="runner-share-icon" aria-hidden="true">
              <Share2 size={58} />
            </div>
            <h2>O TREINO DE HOJE TÁ PAGO!</h2>
            <p>Aproveite para compartilhar essa conquista com seus amigos nas redes sociais!</p>
            <button className="runner-share-primary" onClick={() => void shareWorkout()} disabled={dayCompleted}>
              COMPARTILHAR
            </button>
            <button className="runner-share-cancel" onClick={() => void completeWorkout()} disabled={dayCompleted}>
              Não, obrigado!
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
