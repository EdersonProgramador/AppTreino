import { useEffect, useState } from "react";
import { fetchStaffSummary, type StaffSummary } from "../lib/staff-summary";

const EMPTY: StaffSummary = {
  isStaff: false,
  isCoach: false,
  isActiveCoach: false,
  hasActiveSubscription: false,
  isNutritionist: false,
  roles: [],
  organizations: []
};

export function useStaffSummary(token: string | null) {
  const [summary, setSummary] = useState<StaffSummary>(EMPTY);
  const [loading, setLoading] = useState(Boolean(token));

  useEffect(() => {
    if (!token) {
      setSummary(EMPTY);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    void fetchStaffSummary(token)
      .then((data) => {
        if (!cancelled) setSummary(data);
      })
      .catch(() => {
        if (!cancelled) setSummary(EMPTY);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  return { summary, loading };
}
