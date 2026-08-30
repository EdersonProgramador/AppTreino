import type { AppPrismaClient } from "../prisma.js";
import { prisma } from "../prisma.js";
import { syncUserEnrollmentFromMemberships } from "./membership.utils.js";

/** Marca matrículas ACTIVE com endsAt vencido como OVERDUE e sincroniza enrollmentStatus. */
export async function expireOverdueMemberships(db: AppPrismaClient = prisma) {
  if (!process.env.DATABASE_URL) return 0;

  const now = new Date();
  const expired = await db.membership.findMany({
    where: {
      status: "ACTIVE",
      deletedAt: null,
      endsAt: { lt: now }
    },
    select: { id: true, userId: true }
  });

  if (expired.length === 0) return 0;

  const userIds = new Set<string>();

  for (const membership of expired) {
    await db.membership.update({
      where: { id: membership.id },
      data: { status: "OVERDUE" }
    });
    userIds.add(membership.userId);
  }

  for (const userId of userIds) {
    await syncUserEnrollmentFromMemberships(db, userId);
  }

  return expired.length;
}

const MEMBERSHIP_JOB_INTERVAL_MS = 60 * 60 * 1000;

export function startMembershipMaintenanceJobs(logger: { info: (obj: unknown, msg?: string) => void; error: (obj: unknown, msg?: string) => void }) {
  if (!process.env.DATABASE_URL) return;

  const run = async () => {
    try {
      const count = await expireOverdueMemberships();
      if (count > 0) {
        logger.info({ count }, "memberships marked overdue");
      }
    } catch (error) {
      logger.error({ err: error }, "membership expiry job failed");
    }
  };

  void run();
  setInterval(() => {
    void run();
  }, MEMBERSHIP_JOB_INTERVAL_MS).unref();
}
