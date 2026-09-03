import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { formatPriceInBRL } from "@app-treino/shared";
import { useAuth } from "../../auth/AuthContext";
import { paths, activatePath } from "../../auth/paths";
import { useCatalogPlans } from "../../hooks/useCatalogPlans";
import { patchCheckoutIntent, readCheckoutIntent, resolveCheckoutCouponSelection } from "../../lib/checkout-intent";
import { getEffectivePriceCents, planHasPromoDiscount, plansForCouponDisplay, resolvePlanCodeInCatalog } from "../../lib/plan-catalog";
import { WorkoutOnboarding, type WorkoutOnboardingSubmitPayload } from "../onboarding/WorkoutOnboarding";
import { SubscriptionCheckoutShell } from "./SubscriptionCheckoutShell";
import { SubscriptionFunnelPanel, type BillingType } from "./SubscriptionFunnelPanel";
import { ActivatePendingCheckout } from "./ActivatePendingCheckout";
import { fetchStudentPortalAccess } from "../../lib/student-portal-access";

export function ActivateView() {
  const { user, token, phase, loginState, loginError, selectedPlanCode, setSelectedPlanCode, submitAuth, submitRegisterOnboarding } =
    useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const planFromUrl = searchParams.get("plan");
  const couponFromUrl = searchParams.get("coupon");
  const stepParam = searchParams.get("step");
  const initialStep = stepParam === "account" ? 2 : 1;

  const [portalState, setPortalState] = useState<"loading" | "guest" | "paid" | "unpaid">("loading");

  const preferUrlParams = Boolean(planFromUrl?.trim() || couponFromUrl?.trim());

  const [couponDraft, setCouponDraft] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(() => {
    const resolved = resolveCheckoutCouponSelection({
      checkoutIntent: readCheckoutIntent(),
      couponFromUrl,
      preferUrl: preferUrlParams
    });
    return resolved || null;
  });
  const [couponFeedback, setCouponFeedback] = useState<string | null>(null);
  const [couponApplying, setCouponApplying] = useState(Boolean(couponFromUrl?.trim()));
  const [couponValidForSelection, setCouponValidForSelection] = useState<boolean | null>(
    couponFromUrl?.trim() ? null : false
  );

  const [step, setStep] = useState<1 | 2>(initialStep as 1 | 2);
  const [selectedPlan, setSelectedPlan] = useState(planFromUrl ?? selectedPlanCode ?? "");
  const [accountMode, setAccountMode] = useState<"register" | "login">("register");
  const [billingType, setBillingType] = useState<BillingType>("UNDEFINED");

  const syncSelectedPlan = useCallback(
    (code: string, couponCode?: string | null) => {
      if (!code) return;
      setSelectedPlan(code);
      setSelectedPlanCode(code);
      if (couponCode !== undefined) {
        patchCheckoutIntent({
          planCode: code,
          couponCode: couponCode?.trim().toUpperCase() || undefined,
          source: "activate"
        });
      } else {
        patchCheckoutIntent({
          planCode: code,
          source: "activate"
        });
      }
    },
    [setSelectedPlanCode]
  );

  useEffect(() => {
    const resolved = resolveCheckoutCouponSelection({
      checkoutIntent: readCheckoutIntent(),
      couponFromUrl,
      preferUrl: preferUrlParams
    });
    if (resolved) {
      setAppliedCoupon(resolved);
      setCouponApplying(true);
      setCouponValidForSelection(null);
    }
  }, [couponFromUrl, preferUrlParams]);

  const catalogCouponQuery = useMemo(() => {
    if (!appliedCoupon) return null;
    if (couponApplying || couponValidForSelection === null) return appliedCoupon;
    return couponValidForSelection ? appliedCoupon : null;
  }, [appliedCoupon, couponApplying, couponValidForSelection]);

  const { plans: catalogPlans, allPlans, loading, monthlyBaseline, initialPlanCode } = useCatalogPlans(
    planFromUrl ?? selectedPlanCode,
    catalogCouponQuery
  );

  const catalogCoupon = useMemo(() => {
    if (!appliedCoupon) return null;
    if (loading || couponApplying || couponValidForSelection === null) return appliedCoupon;
    return couponValidForSelection ? appliedCoupon : null;
  }, [appliedCoupon, couponApplying, couponValidForSelection, loading]);

  const plans = useMemo(
    () => plansForCouponDisplay(catalogPlans, appliedCoupon, selectedPlan),
    [appliedCoupon, catalogPlans, selectedPlan]
  );

  useEffect(() => {
    if (planFromUrl) {
      syncSelectedPlan(planFromUrl);
    }
  }, [planFromUrl, syncSelectedPlan]);

  useEffect(() => {
    if (loading || plans.length === 0) return;

    const planRef = selectedPlan || planFromUrl;
    const resolved = resolvePlanCodeInCatalog(planRef, plans);
    if (resolved && resolved !== selectedPlan) {
      syncSelectedPlan(resolved);
      return;
    }

    if (planFromUrl?.trim()) return;

    if (initialPlanCode && !plans.some((plan) => plan.code === selectedPlan)) {
      syncSelectedPlan(initialPlanCode);
    }
  }, [initialPlanCode, loading, planFromUrl, plans, selectedPlan, syncSelectedPlan]);

  const selectedPlanRow = useMemo(
    () => plans.find((plan) => plan.code === selectedPlan) ?? plans[0] ?? null,
    [plans, selectedPlan]
  );
  const selectedPlanHasDiscount = planHasPromoDiscount(selectedPlanRow);
  const checkoutCoupon = selectedPlanHasDiscount ? appliedCoupon : null;

  useEffect(() => {
    if (!selectedPlan) return;
    patchCheckoutIntent({
      planCode: selectedPlan,
      couponCode: appliedCoupon ?? undefined,
      source: "activate"
    });
  }, [appliedCoupon, selectedPlan]);

  useEffect(() => {
    if (!appliedCoupon) {
      setCouponValidForSelection(false);
      setCouponApplying(false);
      return;
    }
    if (loading) return;

    const pricedSelected = allPlans.find((plan) => plan.code === selectedPlan) ?? null;
    const valid = Boolean(pricedSelected && planHasPromoDiscount(pricedSelected));
    setCouponValidForSelection(valid);
    setCouponApplying(false);
    setCouponFeedback(valid ? null : "Código inválido ou indisponível para este plano.");
  }, [appliedCoupon, allPlans, loading, selectedPlan]);

  const handleApplyCoupon = () => {
    const next = couponDraft.trim().toUpperCase();
    if (!next) {
      setAppliedCoupon(null);
      setCouponValidForSelection(false);
      setCouponFeedback(null);
      return;
    }
    setCouponApplying(true);
    setCouponValidForSelection(null);
    setCouponFeedback(null);
    setAppliedCoupon(next);
    setCouponDraft("");
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponValidForSelection(false);
    setCouponApplying(false);
    setCouponDraft("");
    setCouponFeedback(null);
    patchCheckoutIntent({ couponCode: undefined, source: "activate" });
  };

  useEffect(() => {
    if (!user || !token) {
      setPortalState("guest");
      return;
    }
    if (user.role !== "USER") {
      setPortalState("paid");
      return;
    }
    if (user.previewMode) {
      setPortalState("paid");
      return;
    }

    let cancelled = false;
    void fetchStudentPortalAccess(token).then((access) => {
      if (cancelled) return;
      setPortalState(access.hasAccess ? "paid" : "unpaid");
    });

    return () => {
      cancelled = true;
    };
  }, [token, user]);

  if (user && token && user.role === "USER" && portalState === "unpaid") {
    return <ActivatePendingCheckout />;
  }

  if (user && token && user.role === "USER" && portalState === "paid") {
    return <Navigate to={paths.student} replace />;
  }

  if (user && token && user.role !== "USER") {
    return <Navigate to={paths.admin} replace />;
  }

  if (portalState === "loading" && user && token) {
    return (
      <main className="activate-page home-command grid min-h-screen place-items-center">
        <Loader2 className="spin text-brand-gold" size={32} />
      </main>
    );
  }

  if (phase === "restoring" || phase === "redirecting") {
    return (
      <main className="activate-page home-command grid min-h-screen place-items-center">
        <Loader2 className="spin text-brand-gold" size={32} />
      </main>
    );
  }

  const handleContinuePlan = () => {
    syncSelectedPlan(selectedPlan, appliedCoupon);
    setStep(2);
    const base = activatePath(selectedPlan, appliedCoupon);
    navigate(`${base}${base.includes("?") ? "&" : "?"}step=account`, { replace: true });
  };

  const handleRegister = async (payload: WorkoutOnboardingSubmitPayload) => {
    syncSelectedPlan(selectedPlan, appliedCoupon);
    await submitRegisterOnboarding(payload);
  };

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    syncSelectedPlan(selectedPlan, appliedCoupon);
    await submitAuth("login", new FormData(event.currentTarget), "EMAIL");
  };

  return (
    <SubscriptionCheckoutShell
      title="Ative seu sistema ATLLY"
      subtitle="Escolha o plano, crie sua conta e entre no ecossistema de performance humana."
      backHref={paths.home}
    >
      <SubscriptionFunnelPanel
        step={step}
        plans={plans}
        plansLoading={loading}
        monthlyBaseline={monthlyBaseline}
        selectedPlanCode={selectedPlan}
        onSelectPlan={(code) => {
          syncSelectedPlan(code, appliedCoupon);
        }}
        billingType={billingType}
        onBillingTypeChange={setBillingType}
        onContinuePlan={handleContinuePlan}
        error={loginError}
        couponCode={checkoutCoupon}
        stagedCouponCode={appliedCoupon}
        couponDraft={couponDraft}
        onCouponDraftChange={setCouponDraft}
        onApplyCoupon={handleApplyCoupon}
        onRemoveCoupon={handleRemoveCoupon}
        couponFeedback={couponFeedback}
        couponApplying={couponApplying}
        selectedPlanHasDiscount={selectedPlanHasDiscount}
        accountSlot={
          <div className="activate-account-panel">
            <div className="activate-account-tabs" role="tablist" aria-label="Modo de acesso">
              <button
                type="button"
                className={`activate-account-tab${accountMode === "register" ? " is-active" : ""}`}
                onClick={() => setAccountMode("register")}
                role="tab"
                aria-selected={accountMode === "register"}
              >
                Criar conta
              </button>
              <button
                type="button"
                className={`activate-account-tab${accountMode === "login" ? " is-active" : ""}`}
                onClick={() => setAccountMode("login")}
                role="tab"
                aria-selected={accountMode === "login"}
              >
                Já tenho conta
              </button>
            </div>

            {checkoutCoupon ? (
              <p className="activate-login-hint">
                Cupom <strong>{checkoutCoupon}</strong> aplicado ao plano selecionado.
              </p>
            ) : null}

            {accountMode === "register" ? (
              <WorkoutOnboarding
                mode="register"
                submitting={loginState === "submitting"}
                error={loginError}
                selectedPlanName={
                  selectedPlanRow
                    ? `${selectedPlanRow.name} · ${formatPriceInBRL(getEffectivePriceCents(selectedPlanRow))}`
                    : null
                }
                onSubmit={handleRegister}
              />
            ) : (
              <form className="activate-login-form" onSubmit={handleLogin}>
                <label className="ui-label">
                  <span>E-mail ou telefone</span>
                  <input className="ui-input" name="identifier" type="text" autoComplete="username" required />
                </label>
                <label className="ui-label">
                  <span>Senha</span>
                  <input className="ui-input" name="password" type="password" autoComplete="current-password" required />
                </label>
                <button type="submit" className="ui-btn-primary activate-funnel-cta" disabled={loginState === "submitting"}>
                  {loginState === "submitting" ? <Loader2 className="spin" size={18} /> : null}
                  Entrar e concluir assinatura
                </button>
                <p className="activate-login-hint">
                  Ao entrar, você será direcionado ao pagamento do plano{" "}
                  <strong>{selectedPlanRow?.name ?? "selecionado"}</strong>.
                </p>
              </form>
            )}

            <button type="button" className="activate-back-step" onClick={() => setStep(1)}>
              ← Alterar plano
            </button>
          </div>
        }
      />
    </SubscriptionCheckoutShell>
  );
}
