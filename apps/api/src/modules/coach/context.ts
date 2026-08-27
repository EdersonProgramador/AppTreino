import { prisma } from "../../prisma.js";
import { inferBiotype } from "./biotype.js";
import type { CoachContext, CoachWeather } from "./types.js";

function isoDay(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : null;
}

function currentStreak(dates: Set<string>) {
  const cursor = new Date();
  const today = cursor.toISOString().slice(0, 10);
  if (!dates.has(today)) {
    cursor.setDate(cursor.getDate() - 1);
    if (!dates.has(cursor.toISOString().slice(0, 10))) return 0;
  }
  let streak = 0;
  while (dates.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export async function loadCoachContext(
  userId: string,
  extras?: { focus?: string; weather?: CoachWeather | null }
): Promise<CoachContext> {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 120);

  const [user, assessment, sessions, outdoor] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { profile: true }
    }),
    prisma.physicalAssessment.findFirst({
      where: { userId, deletedAt: null },
      orderBy: { assessedAt: "desc" }
    }),
    prisma.workoutSession.findMany({
      where: { userId, status: "COMPLETED", finishedAt: { gte: since } },
      select: { finishedAt: true }
    }),
    prisma.outdoorActivity.findMany({
      where: { userId, status: "COMPLETED", finishedAt: { gte: since } },
      select: { sport: true, finishedAt: true }
    })
  ]);

  const dates = new Set<string>();
  for (const session of sessions) {
    const day = isoDay(session.finishedAt);
    if (day) dates.add(day);
  }
  const sportTotals = { WORKOUT: sessions.length, RUN: 0, WALK: 0, RIDE: 0 };
  for (const activity of outdoor) {
    const day = isoDay(activity.finishedAt);
    if (day) dates.add(day);
    if (activity.sport === "RUN" || activity.sport === "WALK" || activity.sport === "RIDE") {
      sportTotals[activity.sport] += 1;
    }
  }

  const inferred = inferBiotype({
    weightKg: assessment?.weightKg,
    heightCm: assessment?.heightCm,
    bodyFatPct: assessment?.bodyFatPct,
    waistCm: assessment?.waistCm,
    hipCm: assessment?.hipCm
  });

  return {
    name: user.name,
    objective: extras?.focus || user.profile?.objective || "condicionamento",
    level: user.profile?.level || "iniciante",
    daysPerWeek: Math.min(6, Math.max(2, user.profile?.daysPerWeek ?? 4)),
    focus: extras?.focus,
    gender: user.profile?.gender ?? null,
    city: user.profile?.city ?? null,
    equipmentTags: user.profile?.equipmentTags ?? [],
    biotype: inferred.biotype,
    biotypeReason: inferred.reason,
    weightKg: assessment?.weightKg ?? null,
    heightCm: assessment?.heightCm ?? null,
    bodyFatPct: assessment?.bodyFatPct ?? null,
    streakDays: currentStreak(dates),
    sportTotals,
    weather: extras?.weather ?? null
  };
}