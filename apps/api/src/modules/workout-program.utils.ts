export interface ProgramDuration {
  years: number;
  months: number;
  weeks: number;
  days: number;
}

export type ProgramCompletionMode = "BY_SESSIONS" | "BY_DATE" | "BOTH" | "MANUAL";

function nonNegativeInteger(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

export function normalizeProgramDuration(duration: ProgramDuration): ProgramDuration {
  return {
    years: nonNegativeInteger(duration.years),
    months: nonNegativeInteger(duration.months),
    weeks: nonNegativeInteger(duration.weeks),
    days: nonNegativeInteger(duration.days)
  };
}

export function estimateProgramDurationDays(duration: ProgramDuration) {
  const normalized = normalizeProgramDuration(duration);

  return normalized.years * 365 + normalized.months * 30 + normalized.weeks * 7 + normalized.days;
}

function addMonthsClamped(value: Date, months: number) {
  const result = new Date(value);
  const originalDay = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDayOfTargetMonth = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)
  ).getUTCDate();
  result.setUTCDate(Math.min(originalDay, lastDayOfTargetMonth));

  return result;
}

export function calculateProgramEndDate(startedAt: Date, duration: ProgramDuration) {
  const normalized = normalizeProgramDuration(duration);
  const withMonths = addMonthsClamped(startedAt, normalized.years * 12 + normalized.months);
  withMonths.setUTCDate(withMonths.getUTCDate() + normalized.weeks * 7 + normalized.days);

  return withMonths;
}

export function calculateSuggestedSessions(durationDays: number, sessionsPerWeek: number) {
  const safeDays = Math.max(1, nonNegativeInteger(durationDays));
  const safeFrequency = Math.max(1, nonNegativeInteger(sessionsPerWeek));

  return Math.max(1, Math.round((safeDays / 7) * safeFrequency));
}

export function isProgramComplete(input: {
  completionMode: ProgramCompletionMode;
  completedSessions: number;
  plannedSessions: number;
  plannedEndsAt: Date | null;
  now?: Date;
}) {
  const sessionsReached = input.completedSessions >= Math.max(1, input.plannedSessions);
  const dateReached = Boolean(input.plannedEndsAt && (input.now ?? new Date()) >= input.plannedEndsAt);

  if (input.completionMode === "BY_DATE") return dateReached;
  if (input.completionMode === "BOTH") return sessionsReached && dateReached;
  if (input.completionMode === "MANUAL") return false;

  return sessionsReached;
}

export function parseRepetitionRange(value: string) {
  const normalized = value.trim();
  const range = normalized.match(/^(\d+)\s*[-–]\s*(\d+)$/);
  if (range) {
    return {
      min: Number(range[1]),
      max: Number(range[2])
    };
  }

  const fixed = normalized.match(/^\d+$/);
  if (fixed) {
    const repetitions = Number(normalized);
    return { min: repetitions, max: repetitions };
  }

  return { min: null, max: null };
}
