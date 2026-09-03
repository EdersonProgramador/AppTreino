import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ApiError, apiGet, apiPost } from "../../api";
import { paths, unpaidStudentActivatePath } from "../../auth/paths";
import { useAuth } from "../../auth/AuthContext";
import { useCatalogPlans } from "../../hooks/useCatalogPlans";
import { clearCheckoutIntent } from "../../lib/checkout-intent";
import { resolvePendingPaymentForSelectedPlan } from "../../lib/checkout-pending";
import { planHasPromoDiscount, plansForCouponDisplay } from "../../lib/plan-catalog";
import { isSandboxCheckoutEnabled } from "../../lib/sandbox-checkout";
import { fetchStudentPortalAccess, hasStudentPortalAccess } from "../../lib/student-portal-access";
import { uiSounds } from "../../lib/ui-sounds";
import type { CheckoutSessionResponse, NativeCheckoutPayload, PaymentRow, PlanCode } from "../../types/shared";
import type { StudentMembershipRow, StudentProfile } from "../../types/student";
import { SubscriptionCheckoutShell } from "./SubscriptionCheckoutShell";
import { SubscriptionFunnelPanel, type BillingType } from "./SubscriptionFunnelPanel";

export function ActivatePendingCheckout() {
  const { token, user, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const planFromUrl = searchParams.get("plan");
  const couponFromUrl = searchParams.get("coupon");

  const [loadingAccess, setLoadingAccess] = useState(true);
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [membership, setMembership] = useState<StudentMembershipRow | null>(null);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [checkoutPayment, setCheckoutPayment] = useState<PaymentRow | null>(null);
  const [nativeCheckout, setNativeCheckout] = useState<NativeCheckoutPayload | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState<PlanCode | "sandbox" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [billingType, setBillingType] = useState<BillingType>("UNDEFINED");
  const [selectedPlan, setSelectedPlan] = useState(planFromUrl ?? "");
  const [couponDraft, setCouponDraft] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(couponFromUrl?.toUpperCase() ?? null);
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
          navigate(paths.student, { replace: true });
          return;
        }
        setProfile(access.profile);
        setMembership(access.membership);
        const planCode = access.membership?.plan?.code ?? planFromUrl;
        if (planCode) {
          setSelectedPlan(planCode);
        }

        const paymentsResponse = await apiGet<{ payments: PaymentRow[] }>("/user/payments", token);
        setPayments(paymentsResponse.payments);
        setCheckoutPayment(paymentsResponse.payments.find((item) => item.status === "PENDING") ?? null);
      } catch {
        setError("Não foi possível carregar seu checkout pendente.");
      } finally {
        setLoadingAccess(false);
      }
    })();
  }, [navigate, token]);

  const catalogCouponQuery = useMemo(() => {
    if (!appliedCoupon) return null;
    if (couponApplying || couponValidForSelection === null) return appliedCoupon;
    return couponValidForSelection ? appliedCoupon : null;
  }, [appliedCoupon, couponApplying, couponValidForSelection]);

  const { plans: catalogPlans, allPlans, loading: catalogPlansLoading, monthlyBaseline, initialPlanCode } =
    useCatalogPlans(selectedPlan || planFromUrl || membership?.plan?.code, catalogCouponQuery);

  useEffect(() => {
    if (initialPlanCode && !catalogPlans.some((plan) => plan.code === selectedPlan)) {
      setSelectedPlan(initialPlanCode);
    }
  }, [catalogPlans, initialPlanCode, selectedPlan]);

  const plans = useMemo(
    () => plansForCouponDisplay(catalogPlans, appliedCoupon, selectedPlan),
    [appliedCoupon, catalogPlans, selectedPlan]
  );

  const selectedPlanRow = useMemo(
    () => plans.find((plan) => plan.code === selectedPlan) ?? plans[0] ?? null,
    [plans, selectedPlan]
  );
  const selectedPlanHasDiscount = planHasPromoDiscount(selectedPlanRow);
  const checkoutCoupon = selectedPlanHasDiscount ? appliedCoupon : null;

  useEffect(() => {
    if (!appliedCoupon) {
      setCouponValidForSelection(false);
      setCouponApplying(false);
      return;
    }
    if (catalogPlansLoading) return;
    const pricedSelected = allPlans.find((plan) => plan.code === selectedPlan) ?? null;
    const valid = Boolean(pricedSelected && planHasPromoDiscount(pricedSelected));
    setCouponValidForSelection(valid);
    setCouponApplying(false);
    setCouponFeedback(valid ? null : "Código inválido ou indisponível para este plano.");
  }, [allPlans, appliedCoupon, catalogPlansLoading, selectedPlan]);

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
    const access = await fetchStudentPortalAccess(token);
    if (access.hasAccess) {
      navigate(paths.student, { replace: true });
      return;
    }
    setProfile(access.profile);
    setMembership(access.membership);
    setError("Pagamento recebido. Aguardando confirmação final — atualize em instantes.");
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

  const pendingPayment = resolvePendingPaymentForSelectedPlan(
    selectedPlan,
    membership,
    payments,
    checkoutPayment
  );

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
          setCheckoutPayment(null);
          setNativeCheckout(null);
          navigate(unpaidStudentActivatePath(membership, code, checkoutCoupon ?? undefined), { replace: true });
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
        couponDraft={couponDraft}
        onCouponDraftChange={setCouponDraft}
        onApplyCoupon={() => {
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
        }}
        onRemoveCoupon={() => {
          setAppliedCoupon(null);
          setCouponValidForSelection(false);
          setCouponApplying(false);
          setCouponDraft("");
          setCouponFeedback(null);
        }}
        couponFeedback={couponFeedback}
        couponApplying={couponApplying || catalogPlansLoading}
        selectedPlanHasDiscount={selectedPlanHasDiscount}
      />
    </SubscriptionCheckoutShell>
  );
}
