import { useEffect, useMemo, useState } from "react";
import { apiGet } from "../api";
import {
  getDefaultPlanCode,
  getFunnelPlans,
  getMonthlyBaseline,
  normalizeCatalogPlan,
  type CatalogPlan
} from "../lib/plan-catalog";

export type { CatalogPlan };

function normalizeCatalogCouponCode(couponCode?: string | null) {
  const trimmed = couponCode?.trim().toUpperCase();
  return trimmed || null;
}

function buildPlansPath(couponCode?: string | null) {
  const normalized = normalizeCatalogCouponCode(couponCode);
  if (!normalized) return "/plans";
  return `/plans?coupon=${encodeURIComponent(normalized)}`;
}

export function useCatalogPlans(defaultPlanCode?: string | null, couponCode?: string | null) {
  const [plans, setPlans] = useState<CatalogPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadedCouponCode, setLoadedCouponCode] = useState<string | null>(null);
  const requestedCouponCode = normalizeCatalogCouponCode(couponCode);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadedCouponCode(null);
    setError(null);
    void apiGet<{ plans: CatalogPlan[] }>(buildPlansPath(couponCode))
      .then((response) => {
        if (cancelled) return;
        setPlans((response.plans ?? []).map((plan) => normalizeCatalogPlan(plan)));
        setLoadedCouponCode(requestedCouponCode);
      })
      .catch(() => {
        if (cancelled) return;
        setPlans([]);
        setLoadedCouponCode(requestedCouponCode);
        setError("Não foi possível carregar os planos.");
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [couponCode, requestedCouponCode]);

  const couponCatalogReady = !loading && loadedCouponCode === requestedCouponCode;

  const funnelPlans = useMemo(() => getFunnelPlans(plans), [plans]);
  const monthlyBaseline = useMemo(() => getMonthlyBaseline(plans), [plans]);
  const initialPlanCode = useMemo(() => getDefaultPlanCode(plans, defaultPlanCode), [defaultPlanCode, plans]);

  return {
    plans: funnelPlans,
    allPlans: plans,
    loading,
    error,
    monthlyBaseline,
    initialPlanCode,
    couponCatalogReady,
    loadedCouponCode
  };
}
