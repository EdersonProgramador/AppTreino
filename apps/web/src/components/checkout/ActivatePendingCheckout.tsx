import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ApiError, apiGet, apiPost } from "../../api";
import { paths, unpaidStudentActivatePath } from "../../auth/paths";
import { useAuth } from "../../auth/AuthContext";
import { useCatalogPlans } from "../../hooks/useCatalogPlans";
import { clearCheckoutIntent, patchCheckoutIntent, readCheckoutIntent, resolveCheckoutCouponSelection, resolveCheckoutPlanSelection } from "../../lib/checkout-intent";
import { resolvePendingPaymentForSelectedPlan, paymentMatchesPlanPricing } from "../../lib/checkout-pending";
import { planHasPromoDiscount, buildCatalogCouponQuery, plansForCouponDisplay, resolveCouponValidationState, resolvePlanCodeInCatalog } from "../../lib/plan-catalog";
import { isSandboxCheckoutEnabled } from "../../lib/sandbox-checkout";
import { pickPendingCheckoutPayment, syncCheckoutPaymentStatus } from "../../lib/checkout-payment-sync";
import { fetchStudentPortalAccess, hasStudentPortalAccess } from "../../lib/student-portal-access";
import { uiSounds } from "../../lib/ui-sounds";
import type { CheckoutSessionResponse, NativeCheckoutPayload, PaymentRow, PlanCode } from "../../types/shared";
import type { StudentMembershipRow, StudentProfile } from "../../types/student";
import { SubscriptionCheckoutShell } from "./SubscriptionCheckoutShell";
import { SubscriptionFunnelPanel, type BillingType } from "./SubscriptionFunnelPanel";

export function ActivatePendingCheckout() {
  const { token, user, logout, selectedPlanCode } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const planFromUrl = searchParams.get("plan");
  const couponFromUrl = searchParams.get("coupon");
  const checkoutIntent = readCheckoutIntent();

  const [loadingAccess, setLoadingAccess] = useState(true);
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [membership, setMembership] = useState<StudentMembershipRow | null>(null);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [checkoutPayment, setCheckoutPayment] = useState<PaymentRow | null>(null);
  const [nativeCheckout, setNativeCheckout] = useState<NativeCheckoutPayload | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState<PlanCode | "sandbox" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [billingType, setBillingType] = useState<BillingType>("UNDEFINED");
  const preferUrlParams = Boolean(planFromUrl?.trim() || couponFromUrl?.trim());

  const [selectedPlan, setSelectedPlan] = useState(() =>
    resolveCheckoutPlanSelection({
      checkoutIntent,
      planFromUrl,
      selectedPlanCode,
      preferUrl: preferUrlParams
    })
  );
  const [couponDraft, setCouponDraft] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(() => {
    const resolved = resolveCheckoutCouponSelection({
      checkoutIntent,
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

  useEffect(() => {
    if (!token) return;

    void (async () => {
      try {
        const access = await fetchStudentPortalAccess(token);
        if (access.hasAccess) {
          clearCheckoutIntent();
          navigate(paths.student, { replace: true });
          return;
        }
        setProfile(access.profile);
        setMembership(access.membership);
        const resolvedPlan = resolveCheckoutPlanSelection({
          checkoutIntent: readCheckoutIntent(),
          planFromUrl,
          selectedPlanCode,
          membershipPlanCode: access.membership?.plan?.code,
          preferUrl: preferUrlParams
        });
        if (resolvedPlan) {
          setSelectedPlan(resolvedPlan);
        }

        const paymentsResponse = await apiGet<{ payments: PaymentRow[] }>("/user/payments", token);
        setPayments(paymentsResponse.payments);
        const pending = pickPendingCheckoutPayment(paymentsResponse.payments);
        setCheckoutPayment(pending);

        const resolvedCoupon = resolveCheckoutCouponSelection({
          checkoutIntent: readCheckoutIntent(),
          couponFromUrl,
          paymentCouponCode: pending?.couponCode,
          preferUrl: preferUrlParams
        });
        if (resolvedCoupon) {
          setAppliedCoupon(resolvedCoupon);
          setCouponApplying(true);
          setCouponValidForSelection(null);
        }

        patchCheckoutIntent({
          planCode: resolvedPlan || undefined,
          couponCode: resolvedCoupon || undefined,
          source: "activate"
        });

        if (pending) {
          setBillingType("PIX");
          try {
            const synced = await syncCheckoutPaymentStatus(token, pending.id);
            if (synced.alreadyActive || synced.payment.status === "CONFIRMED") {
              clearCheckoutIntent();
              navigate(paths.student, { replace: true });
              return;
            }
            setCheckoutPayment(synced.payment);
            setMembership(synced.membership);
          } catch {
            // polling do NativeCheckoutPayment continua tentando.
          }
        }
      } catch {
        setError("Não foi possível carregar seu checkout pendente.");
      } finally {
        setLoadingAccess(false);
      }
    })();
  }, [couponFromUrl, navigate, planFromUrl, preferUrlParams, selectedPlanCode, token]);

  const catalogCouponQuery = useMemo(() => buildCatalogCouponQuery(appliedCoupon), [appliedCoupon]);

  const {
    plans: catalogPlans,
    allPlans,
    loading: catalogPlansLoading,
    monthlyBaseline,
    initialPlanCode,
    couponCatalogReady,
    loadedCouponCode
  } = useCatalogPlans(selectedPlan || planFromUrl || membership?.plan?.code, catalogCouponQuery);

  useEffect(() => {
    if (catalogPlansLoading || catalogPlans.length === 0) return;

    const selectedExists = catalogPlans.some((plan) => plan.code === selectedPlan);
    const planRef = selectedPlan || planFromUrl;
    const resolved = resolvePlanCodeInCatalog(planRef, catalogPlans);
    if (resolved && resolved !== selectedPlan && !selectedExists) {
      setSelectedPlan(resolved);
      return;
    }

    if (planFromUrl?.trim()) return;

    if (initialPlanCode && !catalogPlans.some((plan) => plan.code === selectedPlan)) {
      setSelectedPlan(initialPlanCode);
    }
  }, [catalogPlans, catalogPlansLoading, initialPlanCode, planFromUrl, selectedPlan]);

  const plans = useMemo(
    () =>
      plansForCouponDisplay(catalogPlans, selectedPlan, {
        appliedCoupon,
        couponValidForSelection
      }),
    [appliedCoupon, catalogPlans, couponValidForSelection, selectedPlan]
  );

  const selectedPlanRow = useMemo(() => {
    const code = resolvePlanCodeInCatalog(selectedPlan, allPlans) || selectedPlan;
    return allPlans.find((plan) => plan.code === code) ?? null;
  }, [allPlans, selectedPlan]);
  const selectedPlanHasDiscount = planHasPromoDiscount(selectedPlanRow);
  const checkoutCoupon = couponValidForSelection && appliedCoupon ? appliedCoupon : null;

  useEffect(() => {
    if (!selectedPlan) return;
    patchCheckoutIntent({
      planCode: selectedPlan,
      couponCode: checkoutCoupon ?? undefined,
      source: "activate"
    });
  }, [checkoutCoupon, selectedPlan]);

  useEffect(() => {
    const next = resolveCouponValidationState(appliedCoupon, selectedPlan, allPlans, {
      couponCatalogReady,
      loadedCouponCode
    });
    setAppliedCoupon(next.appliedCoupon);
    setCouponValidForSelection(next.couponValidForSelection);
    setCouponApplying(next.couponApplying);
    setCouponFeedback(next.couponFeedback);
    if (next.clearedInvalidCoupon) {
      const rejected = appliedCoupon?.trim().toUpperCase();
      if (rejected) setCouponDraft(rejected);
      patchCheckoutIntent({ couponCode: undefined, source: "activate" });
      if (couponFromUrl?.trim()) {
        navigate(unpaidStudentActivatePath(membership, selectedPlan), { replace: true });
      }
    }
  }, [allPlans, appliedCoupon, couponCatalogReady, couponFromUrl, loadedCouponCode, membership, navigate, selectedPlan]);

  function resolveCheckoutCoupon(planCode: PlanCode) {
    if (!checkoutCoupon) return null;
    const plan = allPlans.find((item) => item.code === planCode);
    return plan && planHasPromoDiscount(plan) ? checkoutCoupon : null;
  }

  function applyCheckoutSessionResponse(response: CheckoutSessionResponse) {
    setMembership(response.membership);
    setCheckoutPayment(response.payment);
    setNativeCheckout(response.nativeCheckout ?? null);
    if (response.payment) {
      setPayments((current) => {
        const others = current.filter((item) => item.id !== response.payment?.id);
        return [response.payment, ...others].filter(Boolean) as PaymentRow[];
      });
    }
    if (response.membership && response.payment && hasStudentPortalAccess(profile, response.membership)) {
      clearCheckoutIntent();
      navigate(paths.student, { replace: true });
    }
  }

  async function submitSubscriptionCheckout(input?: { cpfCnpj?: string }) {
    if (!token) return;
    const planCode = selectedPlan as PlanCode;
    if (billingType !== "PIX" && billingType !== "CREDIT_CARD") {
      setError("Escolha Pix ou cartão de crédito para continuar.");
      return;
    }

    setError(null);
    setCheckoutLoading(planCode);

    try {
      const response = await apiPost<CheckoutSessionResponse>(
        "/checkout/session",
        {
          planCode,
          billingType,
          couponCode: resolveCheckoutCoupon(planCode),
          cpfCnpj: input?.cpfCnpj
        },
        token
      );

      applyCheckoutSessionResponse(response);

      if (response.alreadyActive) {
        uiSounds.paymentApproved();
        clearCheckoutIntent();
        navigate(paths.student, { replace: true });
        return;
      }

      if (response.paymentProviderError && !response.nativeCheckout?.pix && billingType !== "CREDIT_CARD") {
        setError(response.paymentProviderError);
      }
    } catch (checkoutError) {
      const message = checkoutError instanceof ApiError ? checkoutError.message : null;
      setError(message ?? "Não foi possível iniciar o checkout.");
    } finally {
      setCheckoutLoading(null);
    }
  }

  async function handleNativePaymentConfirmed() {
    if (!token) return;
    uiSounds.paymentApproved();
    clearCheckoutIntent();
    const pending = checkoutPayment ?? pickPendingCheckoutPayment(payments);
    if (pending) {
      try {
        const synced = await syncCheckoutPaymentStatus(token, pending.id);
        if (synced.alreadyActive || synced.payment.status === "CONFIRMED") {
          navigate(paths.student, { replace: true });
          return;
        }
      } catch {
        // segue para refresh abaixo
      }
    }
    const access = await fetchStudentPortalAccess(token);
    if (access.hasAccess) {
      navigate(paths.student, { replace: true });
      return;
    }
    setProfile(access.profile);
    setMembership(access.membership);
    setError("Pagamento recebido. Aguardando confirmação final — clique em verificar ou atualize a página.");
  }

  async function handleConfirmSandboxPayment() {
    if (!token || !checkoutPayment) return;
    setError(null);
    setCheckoutLoading("sandbox");
    try {
      const response = await apiPost<{ membership: StudentMembershipRow; payment: PaymentRow }>(
        "/checkout/confirm-sandbox",
        { paymentId: checkoutPayment.id },
        token
      );
      setMembership(response.membership);
      setCheckoutPayment(response.payment);
      uiSounds.paymentApproved();
      if (hasStudentPortalAccess(profile, response.membership)) {
        navigate(paths.student, { replace: true });
      }
    } catch (confirmError) {
      const message = confirmError instanceof ApiError ? confirmError.message : null;
      setError(message ?? "Não foi possível confirmar o pagamento sandbox.");
    } finally {
      setCheckoutLoading(null);
    }
  }

  const pendingPaymentForSelectedPlan = resolvePendingPaymentForSelectedPlan(
    selectedPlan,
    membership,
    payments,
    checkoutPayment
  );
  const pendingPayment = useMemo(() => {
    if (!pendingPaymentForSelectedPlan) return null;
    const plan = allPlans.find((item) => item.code === selectedPlan) ?? selectedPlanRow;
    return paymentMatchesPlanPricing(pendingPaymentForSelectedPlan, plan) ? pendingPaymentForSelectedPlan : null;
  }, [allPlans, pendingPaymentForSelectedPlan, selectedPlan, selectedPlanRow]);

  if (loadingAccess) {
    return (
      <main className="activate-page home-command grid min-h-screen place-items-center">
        <Loader2 className="spin text-brand-gold" size={32} />
      </main>
    );
  }

  return (
    <SubscriptionCheckoutShell
      title={`Olá, ${profile?.name?.split(" ")[0] ?? user?.name?.split(" ")[0] ?? "atleta"}`}
      subtitle="Conclua o pagamento para liberar treinos, corrida, IA e comunidade."
      onLogout={() => {
        uiSounds.toggleOff();
        logout();
      }}
      backHref={paths.home}
    >
      <SubscriptionFunnelPanel
        step={3}
        showPaymentStep
        plans={plans}
        plansLoading={catalogPlansLoading}
        monthlyBaseline={monthlyBaseline}
        selectedPlanCode={selectedPlan}
        onSelectPlan={(code) => {
          uiSounds.radioSelect();
          setSelectedPlan(code);
          patchCheckoutIntent({
            planCode: code,
            couponCode: appliedCoupon ?? undefined,
            source: "activate"
          });
          setCheckoutPayment(null);
          setNativeCheckout(null);
          navigate(unpaidStudentActivatePath(membership, code, appliedCoupon ?? undefined), { replace: true });
        }}
        billingType={billingType}
        onBillingTypeChange={(value) => {
          setBillingType(value);
          setCheckoutPayment(null);
          setNativeCheckout(null);
        }}
        checkoutLoading={Boolean(checkoutLoading)}
        pendingPayment={pendingPayment}
        nativeCheckout={nativeCheckout}
        checkoutToken={token}
        payerName={profile?.name ?? user?.name ?? null}
        payerEmail={profile?.email ?? user?.email ?? null}
        payerPhone={profile?.phone ?? null}
        payerDocument={profile?.document ?? null}
        error={error}
        onPrepareCheckout={(input) => void submitSubscriptionCheckout(input)}
        onCheckoutSessionResponse={applyCheckoutSessionResponse}
        onPaymentConfirmed={() => void handleNativePaymentConfirmed()}
        onCheckoutError={setError}
        onConfirmSandbox={() => void handleConfirmSandboxPayment()}
        showSandbox={Boolean(isSandboxCheckoutEnabled() && pendingPayment && pendingPayment.status === "PENDING")}
        couponCode={checkoutCoupon}
        stagedCouponCode={appliedCoupon}
        couponDraft={couponDraft}
        onCouponDraftChange={setCouponDraft}
        onApplyCoupon={() => {
          const next = couponDraft.trim().toUpperCase();
          if (!next) {
            setAppliedCoupon(null);
            setCouponValidForSelection(false);
            setCouponFeedback(null);
            setCheckoutPayment(null);
            setNativeCheckout(null);
            patchCheckoutIntent({ couponCode: undefined, source: "activate" });
            return;
          }
          setCouponApplying(true);
          setCouponValidForSelection(null);
          setCouponFeedback(null);
          setAppliedCoupon(next);
          setCouponDraft("");
          setCheckoutPayment(null);
          setNativeCheckout(null);
        }}
        onRemoveCoupon={() => {
          setAppliedCoupon(null);
          setCouponValidForSelection(false);
          setCouponApplying(false);
          setCouponDraft("");
          setCouponFeedback(null);
          setCheckoutPayment(null);
          setNativeCheckout(null);
          patchCheckoutIntent({ couponCode: undefined, source: "activate" });
        }}
        couponFeedback={couponFeedback}
        couponApplying={couponApplying}
        couponValidForSelection={couponValidForSelection}
        selectedPlanHasDiscount={selectedPlanHasDiscount}
      />
    </SubscriptionCheckoutShell>
  );
}
