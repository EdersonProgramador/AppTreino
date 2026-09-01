import type { StudentMembershipRow, StudentProfile } from "../types/student";

/** Mesma regra da API (`validActiveMembershipWhere` + status ACTIVE). */
export function hasValidActiveMembership(membership: StudentMembershipRow | null | undefined) {
  if (!membership || membership.status !== "ACTIVE") return false;
  const now = Date.now();
  const startsAt = new Date(membership.startsAt).getTime();
  if (!Number.isFinite(startsAt) || startsAt > now) return false;
  if (membership.endsAt) {
    const endsAt = new Date(membership.endsAt).getTime();
    if (Number.isFinite(endsAt) && endsAt < now) return false;
  }
  return true;
}

/** Treinos exigem matrícula vigente ou liberação admin (`enrollmentStatus`). */
export function hasStudentWorkoutAccess(
  profile: Pick<StudentProfile, "enrollmentStatus"> | null | undefined,
  membership: StudentMembershipRow | null | undefined
) {
  if (profile?.enrollmentStatus === "ACTIVE") return true;
  return hasValidActiveMembership(membership);
}
