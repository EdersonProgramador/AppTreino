import { env } from "./env.js";
import { isDeliverableEmail, queueEmail, sendWeeklySummaryEmail } from "./email.js";
import { prisma } from "./prisma.js";

const WEEKLY_DIGEST_INTERVAL_MS = 60 * 60 * 1000;
let lastWeeklyDigestKey: string | null = null;

function currentWeeklyDigestKey(now = new Date()) {
  const year = now.getUTCFullYear();
  const week = Math.floor(
    (Date.UTC(year, now.getUTCMonth(), now.getUTCDate()) - Date.UTC(year, 0, 1)) / (7 * 24 * 60 * 60 * 1000)
  );
  return `${year}-W${week}`;
}

function shouldRunWeeklyDigest(now = new Date()) {
  if (!env.ENABLE_WEEKLY_DIGEST_EMAIL) return false;
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return false;
  // Segunda-feira, 09:00–09:59 UTC-3 ≈ 12:00 UTC
  if (now.getUTCDay() !== 1) return false;
  if (now.getUTCHours() !== 12) return false;
  const key = currentWeeklyDigestKey(now);
  if (lastWeeklyDigestKey === key) return false;
  return true;
}

export async function sendWeeklyDigestEmails() {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setUTCDate(weekStart.getUTCDate() - 7);
  weekStart.setUTCHours(0, 0, 0, 0);

  const users = await prisma.user.findMany({
    where: {
      deletedAt: null,
      role: "USER",
      enrollmentStatus: "ACTIVE"
    },
    select: {
      id: true,
      email: true,
      name: true
    },
    take: 5000
  });

  for (const user of users) {
    if (!isDeliverableEmail(user.email)) continue;

    const [workoutsCompleted, attendanceDays] = await Promise.all([
      prisma.workoutSession.count({
        where: {
          userId: user.id,
          status: "COMPLETED",
          finishedAt: { gte: weekStart }
        }
      }),
      prisma.attendanceRecord.count({
        where: {
          userId: user.id,
          date: { gte: weekStart }
        }
      })
    ]);

    queueEmail(
      () =>
        sendWeeklySummaryEmail({
          to: user.email!,
          userName: user.name,
          workoutsCompleted,
          attendanceDays
        }),
      "weekly-digest"
    );
  }
}

export function startEmailJobs(logger: { info: (obj: unknown, msg?: string) => void; error: (obj: unknown, msg?: string) => void }) {
  if (!process.env.DATABASE_URL) return;

  const run = async () => {
    try {
      if (!shouldRunWeeklyDigest()) return;
      const key = currentWeeklyDigestKey();
      lastWeeklyDigestKey = key;
      await sendWeeklyDigestEmails();
      logger.info({ key }, "weekly digest emails queued");
    } catch (error) {
      logger.error({ err: error }, "weekly digest job failed");
    }
  };

  void run();
  setInterval(() => {
    void run();
  }, WEEKLY_DIGEST_INTERVAL_MS).unref();
}
