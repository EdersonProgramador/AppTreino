import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
config({ path: resolve(rootDir, ".env") });
config({ path: resolve(rootDir, "apps/api/.env") });

const prisma = new PrismaClient();
const now = new Date();

const users = await prisma.user.findMany({
  where: { deletedAt: null, role: "USER" },
  select: {
    id: true,
    name: true,
    email: true,
    enrollmentStatus: true,
    status: true,
    memberships: {
      where: { deletedAt: null },
      select: { id: true, status: true, startsAt: true, endsAt: true, createdAt: true },
      orderBy: { createdAt: "desc" }
    }
  },
  orderBy: { createdAt: "desc" }
});

const summaryActive = await prisma.membership.count({ where: { status: "ACTIVE", deletedAt: null } });
const pendingM = await prisma.membership.count({ where: { status: "PENDING", deletedAt: null } });
const overdueM = await prisma.membership.count({ where: { status: "OVERDUE", deletedAt: null } });
const canceledM = await prisma.membership.count({ where: { status: "CANCELED", deletedAt: null } });

const activeNotStarted = await prisma.membership.count({
  where: { status: "ACTIVE", deletedAt: null, startsAt: { gt: now } }
});
const activeExpired = await prisma.membership.count({
  where: { status: "ACTIVE", deletedAt: null, endsAt: { not: null, lt: now } }
});
const activeValid = await prisma.membership.count({
  where: {
    status: "ACTIVE",
    deletedAt: null,
    startsAt: { lte: now },
    OR: [{ endsAt: null }, { endsAt: { gte: now } }]
  }
});

const enrollmentActive = users.filter((u) => u.enrollmentStatus === "ACTIVE").length;
const enrollmentPending = users.filter((u) => u.enrollmentStatus === "PENDING").length;
const hasActiveMembership = users.filter((u) => u.memberships.some((m) => m.status === "ACTIVE")).length;

const enrollActiveNoActiveM = users.filter(
  (u) => u.enrollmentStatus === "ACTIVE" && !u.memberships.some((m) => m.status === "ACTIVE")
);
const enrollPendingButActiveM = users.filter(
  (u) => u.enrollmentStatus === "PENDING" && u.memberships.some((m) => m.status === "ACTIVE")
);
const enrollActiveButOnlyPendingM = users.filter(
  (u) =>
    u.enrollmentStatus === "ACTIVE" &&
    u.memberships.length > 0 &&
    u.memberships.every((m) => m.status === "PENDING")
);
const enrollActiveCanceledM = users.filter(
  (u) =>
    u.enrollmentStatus === "ACTIVE" &&
    u.memberships.some((m) => m.status === "CANCELED" || m.status === "OVERDUE") &&
    !u.memberships.some((m) => m.status === "ACTIVE")
);

const mapUser = (u) => ({
  name: u.name,
  email: u.email,
  enrollmentStatus: u.enrollmentStatus,
  memberships: u.memberships.map((m) => ({
    status: m.status,
    startsAt: m.startsAt,
    endsAt: m.endsAt,
    expired: m.endsAt ? m.endsAt < now : false,
    notStarted: m.startsAt > now
  }))
});

console.log(
  JSON.stringify(
    {
      totals: {
        users: users.length,
        summaryActiveMemberships: summaryActive,
        pendingMemberships: pendingM,
        overdueMemberships: overdueM,
        canceledMemberships: canceledM,
        activeNotStarted,
        activeExpiredStillMarkedActive: activeExpired,
        activeValidNow: activeValid,
        enrollmentActiveUsers: enrollmentActive,
        enrollmentPendingUsers: enrollmentPending,
        usersWithActiveMembership: hasActiveMembership
      },
      inconsistencies: {
        enrollmentActive_without_activeMembership: enrollActiveNoActiveM.map(mapUser),
        enrollmentPending_with_activeMembership: enrollPendingButActiveM.map(mapUser),
        enrollmentActive_onlyPendingMemberships: enrollActiveButOnlyPendingM.map(mapUser),
        enrollmentActive_canceledOrOverdue_noActive: enrollActiveCanceledM.map(mapUser)
      },
      sampleUsers: users.slice(0, 20).map(mapUser)
    },
    null,
    2
  )
);

await prisma.$disconnect();
