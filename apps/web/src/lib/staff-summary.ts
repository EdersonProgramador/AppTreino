import { apiGet } from "../api";

export type StaffSummary = {
  isStaff: boolean;
  isCoach: boolean;
  isActiveCoach: boolean;
  hasActiveSubscription: boolean;
  isNutritionist: boolean;
  roles: string[];
  organizations: Array<{ id: string; name: string }>;
};

export async function fetchStaffSummary(token: string): Promise<StaffSummary> {
  return apiGet<StaffSummary>("/org/me/staff-summary", token);
}
