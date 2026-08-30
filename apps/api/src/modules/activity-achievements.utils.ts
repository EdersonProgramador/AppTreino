import type { OutdoorSport } from "@prisma/client";
import { prisma } from "../prisma.js";

export type AchievementCatalogItem = {
  slug: string;
  title: string;
  description: string;
  category: "DISTANCE" | "COUNT" | "STREAK" | "CHALLENGE";
  sport?: OutdoorSport;
  metric: "single_distance" | "total_distance" | "total_activities" | "total_calories" | "streak_days" | "challenge_complete";
  threshold: number;
};

export const ACTIVITY_ACHIEVEMENT_CATALOG: AchievementCatalogItem[] = [
  {
    slug: "run-first-5k",
    title: "Primeiros 5 km",
    description: "Complete uma corrida de pelo menos 5 km.",
    category: "DISTANCE",
    sport: "RUN",
    metric: "single_distance",
    threshold: 5000
  },
  {
    slug: "run-first-10k",
    title: "10 km de corrida",
    description: "Complete uma corrida de pelo menos 10 km.",
    category: "DISTANCE",
    sport: "RUN",
    metric: "single_distance",
    threshold: 10000
  },
  {
    slug: "walk-first-10k",
    title: "Caminhada de 10 km",
    description: "Complete uma caminhada de pelo menos 10 km.",
    category: "DISTANCE",
    sport: "WALK",
    metric: "single_distance",
    threshold: 10000
  },
  {
    slug: "ride-first-30k",
    title: "Pedal de 30 km",
    description: "Complete um pedal de pelo menos 30 km.",
    category: "DISTANCE",
    sport: "RIDE",
    metric: "single_distance",
    threshold: 30000
  },
  {
    slug: "outdoor-50km-total",
    title: "50 km acumulados",
    description: "Some 50 km em atividades outdoor concluídas.",
    category: "DISTANCE",
    metric: "total_distance",
    threshold: 50000
  },
  {
    slug: "outdoor-100km-total",
    title: "100 km acumulados",
    description: "Some 100 km em atividades outdoor concluídas.",
    category: "DISTANCE",
    metric: "total_distance",
    threshold: 100000
  },
  {
    slug: "outdoor-10-activities",
    title: "10 atividades",
    description: "Conclua 10 atividades outdoor.",
    category: "COUNT",
    metric: "total_activities",
    threshold: 10
  },
  {
    slug: "outdoor-1000-kcal",
    title: "1.000 kcal queimadas",
    description: "Queime 1.000 kcal em atividades outdoor.",
    category: "COUNT",
    metric: "total_calories",
    threshold: 1000
  },
  {
    slug: "streak-7-days",
    title: "Ofensiva de 7 dias",
    description: "Mantenha atividade por 7 dias seguidos.",
    category: "STREAK",
    metric: "streak_days",
    threshold: 7
  },
  {
    slug: "challenge-complete",
    title: "Desafio concluído",
    description: "Complete 100% de um desafio da comunidade.",
    category: "CHALLENGE",
    metric: "challenge_complete",
    threshold: 1
  }
];

function isoDay(value: Date) {
  return value.toISOString().slice(0, 10);
}

function computeStreakDays(dates: string[]) {
  if (!dates.length) return 0;
  const set = new Set(dates);
  let streak = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  while (set.has(isoDay(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

async function loadUserAchievementContext(userId: string) {
  const [activities, workoutSessions, memberships] = await Promise.all([
    prisma.outdoorActivity.findMany({
      where: { userId, status: "COMPLETED" },
      select: {
        sport: true,
        distanceMeters: true,
        calories: true,
        finishedAt: true
      }
    }),
    prisma.workoutSession.findMany({
      where: { userId, status: "COMPLETED", finishedAt: { not: null } },
      select: { finishedAt: true }
    }),
    prisma.clubMembership.findMany({
      where: { userId },
      select: { challengeId: true, joinedAt: true }
    })
  ]);

  const activityDates = new Set<string>();
  activities.forEach((row) => {
    if (row.finishedAt) activityDates.add(isoDay(row.finishedAt));
  });
  workoutSessions.forEach((row) => {
    if (row.finishedAt) activityDates.add(isoDay(row.finishedAt));
  });

  const totalDistance = activities.reduce((sum, row) => sum + row.distanceMeters, 0);
  const totalCalories = activities.reduce((sum, row) => sum + row.calories, 0);
  const maxDistanceBySport = activities.reduce(
    (acc, row) => {
      acc[row.sport] = Math.max(acc[row.sport] ?? 0, row.distanceMeters);
      return acc;
    },
    {} as Partial<Record<OutdoorSport, number>>
  );

  let challengeComplete = 0;
  if (memberships.length) {
    const challenges = await prisma.clubChallenge.findMany({
      where: { id: { in: memberships.map((item) => item.challengeId) }, isActive: true }
    });
    for (const challenge of challenges) {
      const from =
        challenge.period === "OPEN"
          ? new Date(0)
          : challenge.period === "MONTH"
            ? new Date(new Date().getFullYear(), new Date().getMonth(), 1)
            : (() => {
                const start = new Date();
                const day = (start.getDay() + 6) % 7;
                start.setDate(start.getDate() - day);
                start.setHours(0, 0, 0, 0);
                return start;
              })();
      const progress = activities
        .filter(
          (item) =>
            item.sport === challenge.sport &&
            item.finishedAt &&
            item.finishedAt >= from &&
            (!challenge.cellH3 || true)
        )
        .reduce((sum, item) => sum + item.distanceMeters, 0);
      if (progress >= challenge.goalMeters) challengeComplete += 1;
    }
  }

  return {
    totalDistance,
    totalCalories,
    totalActivities: activities.length,
    maxDistanceBySport,
    streakDays: computeStreakDays([...activityDates].sort()),
    challengeComplete
  };
}

function catalogValue(item: AchievementCatalogItem, ctx: Awaited<ReturnType<typeof loadUserAchievementContext>>) {
  switch (item.metric) {
    case "single_distance":
      return item.sport ? ctx.maxDistanceBySport[item.sport] ?? 0 : 0;
    case "total_distance":
      return ctx.totalDistance;
    case "total_activities":
      return ctx.totalActivities;
    case "total_calories":
      return ctx.totalCalories;
    case "streak_days":
      return ctx.streakDays;
    case "challenge_complete":
      return ctx.challengeComplete;
    default:
      return 0;
  }
}

export async function syncUserActivityAchievements(userId: string) {
  const ctx = await loadUserAchievementContext(userId);
  const earned: string[] = [];

  for (const item of ACTIVITY_ACHIEVEMENT_CATALOG) {
    const value = catalogValue(item, ctx);
    if (value < item.threshold) continue;
    await prisma.userActivityAchievement.upsert({
      where: { userId_slug: { userId, slug: item.slug } },
      update: { value, title: item.title, description: item.description, category: item.category },
      create: {
        userId,
        slug: item.slug,
        title: item.title,
        description: item.description,
        category: item.category,
        value
      }
    });
    earned.push(item.slug);
  }

  return earned;
}

export async function listUserActivityAchievements(userId: string) {
  await syncUserActivityAchievements(userId);
  const [earned, ctx] = await Promise.all([
    prisma.userActivityAchievement.findMany({
      where: { userId },
      orderBy: { earnedAt: "desc" }
    }),
    loadUserAchievementContext(userId)
  ]);

  const earnedSlugs = new Set(earned.map((item) => item.slug));
  const pending = ACTIVITY_ACHIEVEMENT_CATALOG.filter((item) => !earnedSlugs.has(item.slug)).map((item) => {
    const progress = catalogValue(item, ctx);
    return {
      slug: item.slug,
      title: item.title,
      description: item.description,
      category: item.category,
      threshold: item.threshold,
      progress,
      percent: Math.min(100, Math.round((progress / item.threshold) * 100))
    };
  });

  return {
    earned: earned.map((item) => ({
      slug: item.slug,
      title: item.title,
      description: item.description,
      category: item.category,
      value: item.value,
      earnedAt: item.earnedAt
    })),
    pending
  };
}
