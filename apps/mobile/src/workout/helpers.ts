import type { WorkoutExercise, WorkoutIntensityType, WorkoutStructureType } from "../types";
import { mediaUrl } from "../lib/media";

export const structureTypeLabels: Record<WorkoutStructureType, string> = {
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

export const dropSetMax = 2;
export const restPauseRestSeconds = 15;

export function exerciseInstanceKey(exercise: WorkoutExercise) {
  return `${exercise.id}-${exercise.order}`;
}

export function formatElapsedTime(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  return [hours, minutes, seconds].map((item) => String(item).padStart(2, "0")).join(":");
}

export function prescribedReps(exercise: WorkoutExercise) {
  if (exercise.repsMax) return exercise.repsMax;
  if (exercise.repsMin) return exercise.repsMin;
  const fixed = exercise.repsRange.trim().match(/^\d+$/);
  const range = exercise.repsRange.trim().match(/^\d+\s*[-–]\s*(\d+)$/);
  return fixed ? Number(fixed[0]) : range ? Number(range[1]) : 0;
}

export function restPauseTargetReps(exercise: WorkoutExercise) {
  return Math.max(2, prescribedReps(exercise) * 2);
}

export function parseLoad(value: string) {
  const match = value.replace(",", ".").match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

export function prescriptionLabel(exercise: WorkoutExercise) {
  if (exercise.prescriptionType === "DURATION") return `${exercise.durationSeconds ?? 0}s`;
  if (exercise.prescriptionType === "DISTANCE") return `${exercise.distanceMeters ?? 0} m`;
  if (exercise.prescriptionType === "INTERVAL") return `${exercise.sets}x ${exercise.workSeconds ?? 0}s`;
  if (exercise.prescriptionType === "ROUNDS") return `${exercise.rounds ?? exercise.sets} round(s)`;
  if (exercise.prescriptionType === "HOLD") {
    return `${exercise.durationSeconds ?? 0}s${exercise.side ? ` - ${exercise.side}` : ""}`;
  }
  return exercise.repsRange;
}

export function intensityLabel(exercise: WorkoutExercise) {
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

export function instructionSteps(exercise: WorkoutExercise) {
  const equipment = (exercise.equipmentTags ?? []).join(", ");
  return [
    `Prepare a posição inicial para ${exercise.title}${equipment ? ` usando ${equipment}` : ""}.`,
    "Mantenha controle do movimento, postura firme e respiração constante.",
    `Execute ${prescriptionLabel(exercise)} conforme prescrito no treino.`,
    ...(exercise.executionNotes ? [exercise.executionNotes] : []),
    "Finalize a série sem soltar a carga bruscamente e aguarde o descanso configurado."
  ];
}

export function isImageMedia(url: string) {
  if (/^data:image\//i.test(url)) return true;
  const pathOnly = url.split(/[?#]/)[0] ?? url;
  return /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(pathOnly);
}

export function isYouTubeUrl(url: string) {
  return /(youtube\.com|youtu\.be|m\.youtube\.com)/i.test(url);
}

export function isVideoMedia(url: string) {
  if (/^data:video\//i.test(url)) return true;
  if (isYouTubeUrl(url)) return true;
  if (isImageMedia(url)) return false;
  const pathOnly = url.split(/[?#]/)[0] ?? url;
  return /\.(mp4|webm|ogg|ogv|mov|m4v|mkv|mpg|mpeg|m3u8|ts)$/i.test(pathOnly);
}

export function getYouTubeVideoId(url: string) {
  const match =
    url.match(/youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)([\w-]{11})/) ?? url.match(/youtu\.be\/([\w-]{11})/);
  return match ? match[1] : "";
}

export function getYouTubeThumbnailUrl(url: string) {
  const id = getYouTubeVideoId(url);
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : "";
}

export function resolvedMedia(path?: string | null) {
  return mediaUrl(path) ?? "";
}

export function previewMediaUrl(path?: string | null) {
  const url = resolvedMedia(path);
  if (!url) return "";
  if (isYouTubeUrl(url)) return getYouTubeThumbnailUrl(url) || url;
  return url;
}
