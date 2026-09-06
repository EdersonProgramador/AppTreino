import type { Program } from "@prisma/client";
import { prisma } from "../prisma.js";
import { studentMatchesProgramTargetGender, type StudentGender } from "./cms-publication.utils.js";

type ProgramWithDays = Program & { days: { id: string }[] };

const publishedProgramInclude = {
  days: {
    where: {
      workoutBlock: { deletedAt: null }
    }
  }
} as const;

/** Programas de organizações/unidades onde o aluno está vinculado (camada adicional). */
export async function fetchOrganizationProgramsForAthlete(
  userId: string,
  studentGender: StudentGender
): Promise<ProgramWithDays[]> {
  const links = await prisma.athleteOrganizationLink.findMany({
    where: {
      athleteId: userId,
      deletedAt: null,
      status: { in: ["PENDING", "ACTIVE"] }
    },
    select: { organizationId: true, unitId: true }
  });

  if (!links.length) {
    return [];
  }

  const [orgPrograms, assignedProgramIds, coachAssignments] = await Promise.all([
    prisma.program.findMany({
      where: {
        status: "PUBLISHED",
        isActive: true,
        deletedAt: null,
        sourceType: { in: ["ORGANIZATION", "COACH"] },
        modality: { isActive: true, deletedAt: null },
        days: { some: { workoutBlock: { deletedAt: null } } },
        OR: links.flatMap((link) => [
          { organizationId: link.organizationId, unitId: link.unitId },
          { organizationId: link.organizationId, unitId: null }
        ]),
        AND: [
          studentGender
            ? { OR: [{ targetGender: "ALL" as const }, { targetGender: studentGender }] }
            : { targetGender: "ALL" as const }
        ]
      },
      include: publishedProgramInclude
    }),
    prisma.userProgram.findMany({
      where: {
        userId,
        status: "ACTIVE",
        program: {
          deletedAt: null,
          status: "PUBLISHED",
          sourceType: { in: ["ORGANIZATION", "COACH"] }
        }
      },
      select: { programId: true }
    }),
    prisma.professionalAssignment.findMany({
      where: {
        athleteId: userId,
        professionalType: "COACH",
        status: "ACTIVE",
        deletedAt: null
      },
      select: { professionalId: true }
    })
  ]);

  const assignedIds = new Set(assignedProgramIds.map((item) => item.programId));
  const assignedCoachIds = new Set(coachAssignments.map((item) => item.professionalId));

  return orgPrograms.filter((program) => {
    if (program.days.length === 0) return false;
    if (!studentMatchesProgramTargetGender(program.targetGender, studentGender)) return false;

    if (program.sourceType === "COACH" || program.audienceMode === "SELECTED") {
      if (assignedIds.has(program.id)) return true;
      if (program.sourceType === "COACH" && program.coachUserId && assignedCoachIds.has(program.coachUserId)) {
        return true;
      }
      return false;
    }

    return true;
  });
}

export function mergePublishedPrograms(
  platformPrograms: ProgramWithDays[],
  extraPrograms: ProgramWithDays[]
): ProgramWithDays[] {
  const merged = [...platformPrograms];
  for (const program of extraPrograms) {
    if (!merged.some((item) => item.id === program.id)) {
      merged.push(program);
    }
  }
  merged.sort(
    (first, second) =>
      first.sortOrder - second.sortOrder ||
      (second.publishedAt?.getTime() ?? 0) - (first.publishedAt?.getTime() ?? 0) ||
      first.createdAt.getTime() - second.createdAt.getTime()
  );
  return merged;
}
