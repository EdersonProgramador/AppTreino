import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { formatPriceInBRL } from "@app-treino/shared";
import { useAuth } from "../../auth/AuthContext";
import { paths, studentCheckoutPath } from "../../auth/paths";
import { useCatalogPlans } from "../../hooks/useCatalogPlans";
import { setCheckoutIntent } from "../../lib/checkout-intent";
import { getEffectivePriceCents, planHasPromoDiscount, plansForCouponDisplay } from "../../lib/plan-catalog";
import { WorkoutOnboarding, type WorkoutOnboardingSubmitPayload } from "../onboarding/WorkoutOnboarding";
import { SubscriptionCheckoutShell } from "./SubscriptionCheckoutShell";
import { SubscriptionFunnelPanel, type BillingType } from "./SubscriptionFunnelPanel";

export function ActivateView() {
  const { user, token, phase, loginState, loginError, selectedPlanCode, setSelectedPlanCode, submitAuth, submitRegisterOnboarding } =
    useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const planFromUrl = searchParams.get("plan");
  const couponFromUrl = searchParams.get("coupon");
  const stepParam = searchParams.get("step");
  const initialStep = stepParam === "account" ? 2 : 1;

  const [couponDraft, setCouponDraft] = useState(couponFromUrl?.toUpperCase() ?? "");
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(couponFromUrl?.toUpperCase() ?? null);
  const [couponFeedback, setCouponFeedback] = useState<string | null>(null);
  const [couponApplying, setCouponApplying] = useState(Boolean(couponFromUrl?.trim()));
  const [couponValidForSelection, setCouponValidForSelection] = useState<boolean | null>(
    couponFromUrl?.trim() ? null : false
  );

  const [step, setStep] = useState<1 | 2>(initialStep as 1 | 2);
  const [selectedPlan, setSelectedPlan] = useState(planFromUrl ?? selectedPlanCode ?? "");
  const [accountMode, setAccountMode] = useState<"register" | "login">("register");
  const [billingType, setBillingType] = useState<BillingType>("UNDEFINED");

  const catalogCoupon = useMemo(() => {
    if (!appliedCoupon) return null;
    if (couponApplying || couponValidForSelection === null) return appliedCoupon;
    return couponValidForSelection ? appliedCoupon : null;
  }, [appliedCoupon, couponApplying, couponValidForSelection]);

  const { plans: catalogPlans, allPlans, loading, monthlyBaseline, initialPlanCode } = useCatalogPlans(
    planFromUrl ?? selectedPlanCode,
    catalogCoupon
  );

  const plans = useMemo(
    () => plansForCouponDisplay(catalogPlans, appliedCoupon, selectedPlan),
    [appliedCoupon, catalogPlans, selectedPlan]
  );

  useEffect(() => {
    if (planFromUrl) {
      setSelectedPlanCode(planFromUrl);
      setSelectedPlan(planFromUrl);
    }
  }, [planFromUrl, setSelectedPlanCode]);

  useEffect(() => {
    if (initialPlanCode && !plans.some((plan) => plan.code === selectedPlan)) {
      setSelectedPlan(initialPlanCode);
    }
  }, [initialPlanCode, plans, selectedPlan]);

  const selectedPlanRow = useMemo(
    () => plans.find((plan) => plan.code === selectedPlan) ?? plans[0] ?? null,
    [plans, selectedPlan]
  );
  const selectedPlanHasDiscount = planHasPromoDiscount(selectedPlanRow);
  const checkoutCoupon = selectedPlanHasDiscount ? appliedCoupon : null;

  useEffect(() => {
    setCheckoutIntent({ planCode: selectedPlan, couponCode: checkoutCoupon ?? undefined, source: "activate" });
  }, [checkoutCoupon, selectedPlan]);

  useEffect(() => {
    if (loading || !appliedCoupon) {
      if (!appliedCoupon) {
        setCouponValidForSelection(false);
        setCouponApplying(false);
      }
      return;
    }

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
    setAppliedCoupon(next);
    setCouponDraft("");
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponValidForSelection(false);
    setCouponApplying(false);
    setCouponDraft("");
    setCouponFeedback(null);
  };

  if (user && token && user.role === "USER") {
    return <Navigate to={studentCheckoutPath(selectedPlan, checkoutCoupon ?? undefined)} replace />;
  }

  if (user && token) {
    return <Navigate to={paths.admin} replace />;
  }

  if (phase === "restoring" || phase === "redirecting") {
    return (
      <main className="activate-page home-command grid min-h-screen place-items-center">
        <Loader2 className="spin text-brand-gold" size={32} />
      </main>
    );
  }

  const handleContinuePlan = () => {
    setCheckoutIntent({ planCode: selectedPlan, couponCode: checkoutCoupon ?? undefined, source: "activate" });
    setSelectedPlanCode(selectedPlan);
    setStep(2);
    navigate(`${paths.activate}?plan=${encodeURIComponent(selectedPlan)}&step=account`, { replace: true });
  };

  const handleRegister = async (payload: WorkoutOnboardingSubmitPayload) => {
    setSelectedPlanCode(selectedPlan);
    await submitRegisterOnboarding(payload);
  };

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSelectedPlanCode(selectedPlan);
    setCheckoutIntent({ planCode: selectedPlan, couponCode: checkoutCoupon ?? undefined, source: "activate" });
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
          setSelectedPlan(code);
          setSelectedPlanCode(code);
        }}
        billingType={billingType}
        onBillingTypeChange={setBillingType}
        onContinuePlan={handleContinuePlan}
        error={loginError}
        couponCode={checkoutCoupon}
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
