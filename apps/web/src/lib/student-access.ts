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

export function isCoachManagedStudent(
  profile: Pick<StudentProfile, "studentAccessProfile"> | null | undefined
) {
  return profile?.studentAccessProfile === "COACH_MANAGED";
}

/** Entrada no portal /aluno (convite coach, matrícula admin ou assinatura). */
export function hasStudentPortalAccess(
  profile: Pick<StudentProfile, "enrollmentStatus" | "studentAccessProfile"> | null | undefined,
  membership: StudentMembershipRow | null | undefined
) {
  if (hasValidActiveMembership(membership)) return true;
  if (isCoachManagedStudent(profile) && profile?.enrollmentStatus === "ACTIVE") return true;
  if (profile?.enrollmentStatus === "ACTIVE") return true;
  return false;
}

/** Catálogo ATLLY + corrida exigem assinatura B2C (coach-managed não inclui por padrão). */
export function hasPlatformTrainingSubscription(
  profile: Pick<StudentProfile, "studentAccessProfile"> | null | undefined,
  membership: StudentMembershipRow | null | undefined
) {
  return hasValidActiveMembership(membership);
}

export function needsCoachManagedPlatformUpsell(
  profile: Pick<StudentProfile, "studentAccessProfile" | "enrollmentStatus"> | null | undefined,
  membership: StudentMembershipRow | null | undefined
) {
  return isCoachManagedStudent(profile) && profile?.enrollmentStatus === "ACTIVE" && !hasValidActiveMembership(membership);
}

/** @deprecated Use hasStudentPortalAccess — mantido para chamadas existentes. */
export function hasStudentWorkoutAccess(
  profile: Pick<StudentProfile, "enrollmentStatus" | "studentAccessProfile"> | null | undefined,
  membership: StudentMembershipRow | null | undefined
) {
  return hasStudentPortalAccess(profile, membership);
}
