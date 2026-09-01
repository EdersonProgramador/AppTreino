import { useEffect, useMemo, useRef, useState } from "react";
import { apiGet } from "../api";
import {
  getDefaultPlanCode,
  getFunnelPlans,
  getMonthlyBaseline,
  normalizeCatalogPlan,
  type CatalogPlan
} from "../lib/plan-catalog";

export type { CatalogPlan };

function buildPlansPath(couponCode?: string | null) {
  const trimmed = couponCode?.trim();
  if (!trimmed) return "/plans";
  return `/plans?coupon=${encodeURIComponent(trimmed.toUpperCase())}`;
}

export function useCatalogPlans(defaultPlanCode?: string | null, couponCode?: string | null) {
  const [plans, setPlans] = useState<CatalogPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    if (!hasLoadedRef.current) {
      setLoading(true);
    }
    setError(null);
    void apiGet<{ plans: CatalogPlan[] }>(buildPlansPath(couponCode))
      .then((response) => {
        if (cancelled) return;
        setPlans((response.plans ?? []).map((plan) => normalizeCatalogPlan(plan)));
      })
      .catch(() => {
        if (cancelled) return;
        if (!hasLoadedRef.current) setPlans([]);
        setError("Não foi possível carregar os planos.");
      })
      .finally(() => {
        if (cancelled) return;
        hasLoadedRef.current = true;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [couponCode]);

  const funnelPlans = useMemo(() => getFunnelPlans(plans), [plans]);
  const monthlyBaseline = useMemo(() => getMonthlyBaseline(plans), [plans]);
  const initialPlanCode = useMemo(() => getDefaultPlanCode(plans, defaultPlanCode), [defaultPlanCode, plans]);

  return { plans: funnelPlans, allPlans: plans, loading, error, monthlyBaseline, initialPlanCode };
}
