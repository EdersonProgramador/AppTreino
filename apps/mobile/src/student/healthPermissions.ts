import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { requestMotionPermissions } from "./healthBridge";

const KEY = "app-treino-health-grants-v1";
const PROMPTED_KEY = "app-treino-health-prompted-v1";

export type HealthDataType =
  | "activity"
  | "heartRate"
  | "walkingRunningDistance"
  | "cyclingDistance"
  | "activeEnergy"
  | "workouts"
  | "steps"
  | "exerciseRoutes";

export const HEALTH_READ_TYPES: Array<{ id: HealthDataType; label: string; hint: string }> = [
  { id: "activity", label: "Atividade", hint: "Reconhecimento de movimento para treinos e ofensiva." },
  { id: "heartRate", label: "Batimento", hint: "Frequência cardíaca do relógio e sensores." },
  { id: "walkingRunningDistance", label: "Distância a Pé + Correndo", hint: "Metros de caminhada e corrida." },
  { id: "cyclingDistance", label: "Distância de Ciclismo", hint: "Quilômetros pedalados." },
  { id: "activeEnergy", label: "Energia Ativa", hint: "Calorias ativas do treino." },
  { id: "workouts", label: "Exercícios", hint: "Sessões de treino, corrida, caminhada e pedal." },
  { id: "steps", label: "Passos", hint: "Contagem de passos do pedômetro." },
  { id: "exerciseRoutes", label: "Rotas de Exercícios", hint: "Trajeto GPS das atividades ao ar livre." }
];

export const HEALTH_UPDATE_TYPES: Array<{ id: HealthDataType; label: string }> = [
  { id: "heartRate", label: "Batimento" },
  { id: "walkingRunningDistance", label: "Distância a Pé + correndo" },
  { id: "cyclingDistance", label: "Distância de ciclismo" },
  { id: "activeEnergy", label: "Energia Ativa" },
  { id: "workouts", label: "Exercícios" },
  { id: "steps", label: "Passos" }
];

type Grants = Record<HealthDataType, boolean>;

const DEFAULT_GRANTS: Grants = {
  activity: false,
  heartRate: false,
  walkingRunningDistance: false,
  cyclingDistance: false,
  activeEnergy: false,
  workouts: false,
  steps: false,
  exerciseRoutes: false
};

let grants: Grants = { ...DEFAULT_GRANTS };
let hydrated = false;
const listeners = new Set<(next: Grants) => void>();

function notify() {
  for (const listener of listeners) listener(grants);
}

export function subscribeHealthGrants(listener: (next: Grants) => void) {
  listeners.add(listener);
  listener(grants);
  return () => {
    listeners.delete(listener);
  };
}

export function getHealthGrants() {
  return grants;
}

export function hasHealthAccess() {
  return grants.steps || grants.activity || grants.heartRate;
}

export async function hydrateHealthGrants() {
  if (hydrated) return grants;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) grants = { ...DEFAULT_GRANTS, ...(JSON.parse(raw) as Grants) };
  } catch {
    grants = { ...DEFAULT_GRANTS };
  }
  hydrated = true;
  notify();
  return grants;
}

export async function wasHealthPrompted() {
  try {
    return (await AsyncStorage.getItem(PROMPTED_KEY)) === "1";
  } catch {
    return false;
  }
}

export async function markHealthPrompted() {
  await AsyncStorage.setItem(PROMPTED_KEY, "1").catch(() => undefined);
}

async function persist(next: Grants) {
  grants = next;
  notify();
  await AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => undefined);
}

export async function requestHealthAccess(types: HealthDataType[] = HEALTH_READ_TYPES.map((item) => item.id)) {
  await hydrateHealthGrants();
  const os = await requestMotionPermissions();
  const next = { ...grants };
  if (os.steps) {
    next.steps = true;
    next.walkingRunningDistance = true;
  }
  if (os.activity) {
    next.activity = true;
    next.workouts = true;
    next.activeEnergy = true;
  }
  if (os.heart && types.includes("heartRate")) {
    next.heartRate = true;
  }
  if (os.activity && types.includes("cyclingDistance")) next.cyclingDistance = true;
  if (os.activity && types.includes("exerciseRoutes")) next.exerciseRoutes = true;
  if (Platform.OS === "web") {
    for (const type of types) next[type] = true;
  }
  await persist(next);
  await markHealthPrompted();
  return next;
}

export async function denyHealthAccess() {
  await persist({ ...DEFAULT_GRANTS });
  await markHealthPrompted();
  return grants;
}
