import { apiGet } from "../api";
import type { StudentMembershipRow, StudentProfile } from "../types/student";
import { hasStudentWorkoutAccess } from "./student-access";

export function hasStudentPortalAccess(
  profile: Pick<StudentProfile, "enrollmentStatus"> | null | undefined,
  membership: StudentMembershipRow | null | undefined
) {
  return hasStudentWorkoutAccess(profile, membership);
}

export async function fetchStudentPortalAccess(token: string) {
  const [profileResponse, membershipResponse] = await Promise.all([
    apiGet<{ profile: StudentProfile }>("/user/profile", token),
    apiGet<{ membership: StudentMembershipRow | null }>("/user/membership", token)
  ]);

  const profile = profileResponse.profile;
  const membership = membershipResponse.membership;

  return {
    profile,
    membership,
    hasAccess: hasStudentPortalAccess(profile, membership)
  };
}
