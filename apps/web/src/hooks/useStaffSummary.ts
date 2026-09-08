import { useCallback, useEffect, useState } from "react";
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
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token) {
      setSummary(EMPTY);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await fetchStaffSummary(token);
      setSummary(data);
    } catch (err) {
      setSummary(EMPTY);
      setError(err instanceof Error ? err.message : "Falha ao carregar papel profissional.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!token) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh, token]);

  return { summary, loading, error, refresh };
}
