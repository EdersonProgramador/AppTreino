import AsyncStorage from "@react-native-async-storage/async-storage";

const RUNNER_KEY = "apptreino.workout.runner";

export type RunnerPanel = "sequence" | "run" | "execution" | "muscles" | "expand" | "video" | "load";
export type RunnerPhase = "idle" | "active" | "rest";

export type WorkoutRunnerPersist = {
  sessionId: string | null;
  isRunning: boolean;
  isPaused: boolean;
  panel: RunnerPanel;
  phase: RunnerPhase;
  currentExerciseIndex: number;
  currentSet: number;
  restRemaining: number;
  restEndsAt: number | null;
  elapsedBase: number;
  runningStartedAt: number | null;
  completedIds: string[];
  dropCount: number;
  restPauseAccum: number;
  workoutReadyToComplete: boolean;
  advanceAfterRest: boolean;
};

const PANELS: RunnerPanel[] = ["sequence", "run", "execution", "muscles", "expand", "video", "load"];
const PHASES: RunnerPhase[] = ["idle", "active", "rest"];

export function computeElapsed(state: Pick<WorkoutRunnerPersist, "isRunning" | "isPaused" | "elapsedBase" | "runningStartedAt">) {
  if (!state.isRunning || state.isPaused || !state.runningStartedAt) {
    return Math.max(0, Math.floor(state.elapsedBase));
  }
  return Math.max(0, Math.floor(state.elapsedBase + (Date.now() - state.runningStartedAt) / 1000));
}

export function computeRestRemaining(restEndsAt: number | null, fallback = 0) {
  if (restEndsAt == null) return Math.max(0, fallback);
  return Math.max(0, Math.ceil((restEndsAt - Date.now()) / 1000));
}

function normalize(parsed: Partial<WorkoutRunnerPersist>): WorkoutRunnerPersist | null {
  if (!parsed || parsed.isRunning !== true) return null;
  return {
    sessionId: typeof parsed.sessionId === "string" ? parsed.sessionId : null,
    isRunning: true,
    isPaused: Boolean(parsed.isPaused),
    panel: PANELS.includes(parsed.panel as RunnerPanel) ? (parsed.panel as RunnerPanel) : "run",
    phase: PHASES.includes(parsed.phase as RunnerPhase) ? (parsed.phase as RunnerPhase) : "active",
    currentExerciseIndex: Math.max(0, Number(parsed.currentExerciseIndex) || 0),
    currentSet: Math.max(1, Number(parsed.currentSet) || 1),
    restRemaining:
      parsed.phase === "rest"
        ? computeRestRemaining(
            typeof parsed.restEndsAt === "number" ? parsed.restEndsAt : null,
            Math.max(0, Number(parsed.restRemaining) || 0)
          )
        : Math.max(0, Number(parsed.restRemaining) || 0),
    restEndsAt: typeof parsed.restEndsAt === "number" ? parsed.restEndsAt : null,
    elapsedBase: Math.max(0, Number(parsed.elapsedBase) || 0),
    runningStartedAt:
      typeof parsed.runningStartedAt === "number" ? parsed.runningStartedAt : parsed.isPaused ? null : Date.now(),
    completedIds: Array.isArray(parsed.completedIds) ? parsed.completedIds.filter((id) => typeof id === "string") : [],
    dropCount: Math.max(0, Number(parsed.dropCount) || 0),
    restPauseAccum: Math.max(0, Number(parsed.restPauseAccum) || 0),
    workoutReadyToComplete: Boolean(parsed.workoutReadyToComplete),
    advanceAfterRest: Boolean(parsed.advanceAfterRest)
  };
}

export async function readWorkoutRunner(): Promise<WorkoutRunnerPersist | null> {
  try {
    const raw = await AsyncStorage.getItem(RUNNER_KEY);
    if (!raw) return null;
    return normalize(JSON.parse(raw) as Partial<WorkoutRunnerPersist>);
  } catch {
    return null;
  }
}

export async function writeWorkoutRunner(state: WorkoutRunnerPersist) {
  try {
    if (!state.isRunning) {
      await AsyncStorage.removeItem(RUNNER_KEY);
      return;
    }
    await AsyncStorage.setItem(RUNNER_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

export async function clearWorkoutRunner() {
  try {
    await AsyncStorage.removeItem(RUNNER_KEY);
  } catch {
    // ignore
  }
}
