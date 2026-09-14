import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import * as Linking from "expo-linking";
import {
  AtllyCinemaPanel,
  AtllyGhostLink,
  AtllyPrimaryButton,
  AtllySecondaryButton,
  AtllyStepper,
  cinema
} from "../auth/atllyAuthUi";
import { apiGet, apiPost, loginWithPassword, NativeApiError } from "../auth/api";
import type { NativeSession } from "../auth/types";
import { AppleIapPanel } from "../checkout/AppleIapPanel";
import { ActivateAccountReview } from "../checkout/ActivateAccountReview";
import { ActivateCheckoutShell } from "../checkout/ActivateCheckoutShell";
import { ActivateFunnelFooter } from "../checkout/ActivateFunnelFooter";
import { ActivateStepTransition } from "../checkout/ActivateMotion";
import { ActivatePlanCard } from "../checkout/ActivatePlanCard";
import { WorkoutOnboardingForm } from "../checkout/WorkoutOnboardingForm";
import { paymentMatchesPlanPricing, resolvePendingPaymentForSelectedPlan } from "../lib/checkout-pending";
import { pickPendingCheckoutPayment, syncCheckoutPaymentStatus } from "../lib/checkout-payment-sync";
import type { CheckoutRegisterResponse, CheckoutSessionResponse, NativeCheckoutPayload } from "../checkout/types";
import {
  patchCheckoutIntent,
  readCheckoutIntent,
  resolveCheckoutCouponSelection,
  resolveCheckoutPlanSelection,
  resolveCheckoutReferralSelection
} from "../lib/checkout-intent";
import { formatCpf, onlyDigits } from "../lib/cpf";
import { levelLabel, type OnboardingSubmitPayload } from "../lib/onboarding";
import type { MembershipRow, PaymentRow, StudentProfile } from "../types";
import {
  defaultAnnualInstallmentCount,
  formatCardInstallmentLabel,
  getDefaultPlanCode,
  getEffectivePriceCents,
  getFunnelPlans,
  getMonthlyBaseline,
  isCheckoutEligiblePlan,
  listAnnualInstallmentCounts,
  normalizeCatalogPlan,
  planAllowsCreditCardCheckout,
  plansForCouponDisplay,
  resolveCouponValidationState,
  type CatalogPlan
} from "../lib/plan-catalog";
import { configureAppleIap } from "../lib/apple-iap";
import { allowsAsaasCheckout, isIosStoreCheckout } from "../lib/platform-pay";
import { brand } from "../student/brand";
import { uiSounds } from "../student/uiSounds";
import { money } from "../theme";

type ActivateStep = 1 | 2 | 3;
type AccountMode = "register" | "login";

const STEP_LABELS = ["Plano", "Conta", "Pagamento"];

function parseActivateQuery(url: string | null) {
  if (!url) return { plan: "", coupon: "", ref: "" };
  const parsed = Linking.parse(url);
  const params = parsed.queryParams ?? {};
  const pick = (key: string) => {
    const value = params[key];
    if (typeof value === "string") return value;
    if (Array.isArray(value)) return value[0] ?? "";
    return "";
  };
  return { plan: pick("plan"), coupon: pick("coupon"), ref: pick("ref") };
}

export function ActivateScreen({
  onBack,
  onLoggedIn,
  resumeSession,
  resumePlanCode,
  resumeProfile,
  resumeMembership,
  resumePayments,
  onRefresh,
  onLogout
}: {
  onBack?: () => void;
  onLoggedIn: (session: NativeSession) => void | Promise<void>;
  resumeSession?: NativeSession;
  resumePlanCode?: string | null;
  resumeProfile?: StudentProfile | null;
  resumeMembership?: MembershipRow;
  resumePayments?: PaymentRow[];
  onRefresh?: () => Promise<void>;
  onLogout?: () => void;
}) {
  const isResume = Boolean(resumeSession);
  const [step, setStep] = useState<ActivateStep>(isResume ? 3 : 1);
  const [rawPlans, setRawPlans] = useState<CatalogPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [planCode, setPlanCode] = useState(resumePlanCode ?? "");
  const [couponDraft, setCouponDraft] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [loadedCouponCode, setLoadedCouponCode] = useState<string | null>(null);
  const [couponValidForSelection, setCouponValidForSelection] = useState<boolean | null>(null);
  const [couponApplying, setCouponApplying] = useState(false);
  const [couponFeedback, setCouponFeedback] = useState<string | null>(null);
  const [rejectedCouponCode, setRejectedCouponCode] = useState<string | null>(null);
  const [accountMode, setAccountMode] = useState<AccountMode>("register");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingNotice, setPendingNotice] = useState<string | null>(null);
  const [resumeCheckoutPayment, setResumeCheckoutPayment] = useState<PaymentRow | null>(null);

  const [referralSlug, setReferralSlug] = useState<string | null>(null);
  const [loginId, setLoginId] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginDocument, setLoginDocument] = useState("");

  const [session, setSession] = useState<NativeSession | null>(resumeSession ?? null);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [nativeCheckout, setNativeCheckout] = useState<NativeCheckoutPayload | null>(null);
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [payBillingType, setPayBillingType] = useState<"PIX" | "CREDIT_CARD">("PIX");
  const [installmentCount, setInstallmentCount] = useState(1);
  const [providerError, setProviderError] = useState<string | null>(null);

  const [cardHolder, setCardHolder] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardMonth, setCardMonth] = useState("");
  const [cardYear, setCardYear] = useState("");
  const [cardCcv, setCardCcv] = useState("");
  const [cardEmail, setCardEmail] = useState("");
  const [cardCpf, setCardCpf] = useState("");
  const [cardCep, setCardCep] = useState("");
  const [cardNumberAddr, setCardNumberAddr] = useState("");
  const [cardPhone, setCardPhone] = useState("");

  const resumeStarted = useRef(false);
  const autoPixStarted = useRef(false);
  const plansRequestId = useRef(0);

  const monthlyBaseline = useMemo(() => getMonthlyBaseline(rawPlans), [rawPlans]);
  const funnelPlans = useMemo(() => getFunnelPlans(rawPlans), [rawPlans]);

  const checkoutCoupon = couponValidForSelection && appliedCoupon ? appliedCoupon : null;
  const couponBlocksCheckout = Boolean(appliedCoupon?.trim()) && couponValidForSelection === null;

  const displayPlans = useMemo(
    () =>
      plansForCouponDisplay(funnelPlans, planCode, {
        appliedCoupon: checkoutCoupon,
        couponValidForSelection
      }),
    [checkoutCoupon, couponValidForSelection, funnelPlans, planCode]
  );

  const selectedPlan = displayPlans.find((plan) => plan.code === planCode) ?? displayPlans[0] ?? null;
  const selectedPlanAllowsCard = planAllowsCreditCardCheckout(selectedPlan);
  const canCheckoutSelectedPlan = selectedPlan
    ? isIosStoreCheckout() || isCheckoutEligiblePlan(selectedPlan)
    : false;
  const installmentOptions = useMemo(
    () => listAnnualInstallmentCounts(paymentAmount || getEffectivePriceCents(selectedPlan ?? { code: "", name: "", priceInCents: 0, billingCycle: "MONTHLY", cardBenefits: [], isFeatured: false, sortOrder: 0 })),
    [paymentAmount, selectedPlan]
  );

  const loadPlans = useCallback(
    async (coupon?: string | null) => {
      const requestId = ++plansRequestId.current;
      const queryCoupon = coupon?.trim().toUpperCase() || null;
      setPlansLoading(true);
      try {
        const query = queryCoupon ? `?coupon=${encodeURIComponent(queryCoupon)}` : "";
        const response = await apiGet<{ plans: Partial<CatalogPlan>[] }>(`/plans${query}`);
        if (requestId !== plansRequestId.current) return;
        const next = (response.plans ?? []).map((plan) =>
          normalizeCatalogPlan({
            ...plan,
            code: plan.code ?? "",
            name: plan.name ?? "",
            priceInCents: plan.priceInCents ?? 0
          })
        );
        setRawPlans(next);
        setLoadedCouponCode(queryCoupon);
        setPlanCode((current) => getDefaultPlanCode(next, current || resumePlanCode || undefined));
      } catch {
        if (requestId !== plansRequestId.current) return;
        setRawPlans([]);
      } finally {
        if (requestId === plansRequestId.current) setPlansLoading(false);
      }
    },
    [resumePlanCode]
  );

  useEffect(() => {
    void loadPlans(appliedCoupon);
  }, [appliedCoupon, loadPlans]);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const intent = await readCheckoutIntent();
      const initialUrl = await Linking.getInitialURL();
      const deep = parseActivateQuery(initialUrl);
      const preferUrl = Boolean(deep.plan || deep.coupon || deep.ref);
      const resolvedPlan = resolveCheckoutPlanSelection({
        checkoutIntent: intent,
        planFromUrl: deep.plan,
        membershipPlanCode: resumePlanCode,
        preferUrl
      });
      const resolvedCoupon = resolveCheckoutCouponSelection({
        checkoutIntent: intent,
        couponFromUrl: deep.coupon,
        preferUrl
      });
      const resolvedReferral = resolveCheckoutReferralSelection({
        checkoutIntent: intent,
        referralFromUrl: deep.ref,
        preferUrl
      });
      if (!mounted) return;
      if (resolvedPlan) setPlanCode(resolvedPlan);
      if (resolvedCoupon) {
        setAppliedCoupon(resolvedCoupon);
        setCouponDraft(resolvedCoupon);
      }
      if (resolvedReferral) {
        setReferralSlug(resolvedReferral);
        await patchCheckoutIntent({ referralSlug: resolvedReferral, source: "activate" });
        void apiGet(`/public/coach-ref/${encodeURIComponent(resolvedReferral)}`).catch(() => undefined);
      }
    })();
    const subscription = Linking.addEventListener("url", ({ url }) => {
      const deep = parseActivateQuery(url);
      if (deep.plan) setPlanCode(deep.plan);
      if (deep.coupon) {
        setAppliedCoupon(deep.coupon.toUpperCase());
        setCouponDraft(deep.coupon.toUpperCase());
      }
      if (deep.ref) {
        setReferralSlug(deep.ref.toLowerCase());
        void patchCheckoutIntent({ referralSlug: deep.ref.toLowerCase(), source: "activate" });
        void apiGet(`/public/coach-ref/${encodeURIComponent(deep.ref)}`).catch(() => undefined);
      }
    });
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, [resumePlanCode]);

  useEffect(() => {
    const next = resolveCouponValidationState(appliedCoupon, planCode, rawPlans, {
      couponCatalogReady: !plansLoading,
      loadedCouponCode
    });
    setAppliedCoupon(next.appliedCoupon);
    setCouponValidForSelection(next.couponValidForSelection);
    setCouponApplying(next.couponApplying);
    setCouponFeedback(next.couponFeedback);
    if (next.clearedInvalidCoupon) {
      if (next.rejectedCouponCode) {
        setCouponDraft(next.rejectedCouponCode);
        setRejectedCouponCode(next.rejectedCouponCode);
      }
      void patchCheckoutIntent({ couponCode: undefined, source: "activate" });
    }
  }, [appliedCoupon, loadedCouponCode, planCode, plansLoading, rawPlans]);

  useEffect(() => {
    if (!rejectedCouponCode) return;
    const timer = setTimeout(() => setRejectedCouponCode(null), 1400);
    return () => clearTimeout(timer);
  }, [rejectedCouponCode]);

  useEffect(() => {
    if (!selectedPlanAllowsCard && payBillingType === "CREDIT_CARD") {
      setPayBillingType("PIX");
    }
  }, [payBillingType, selectedPlanAllowsCard]);

  useEffect(() => {
    const amount = paymentAmount || (selectedPlan ? getEffectivePriceCents(selectedPlan) : 0);
    if (amount > 0) setInstallmentCount(defaultAnnualInstallmentCount(amount));
  }, [paymentAmount, selectedPlan]);

  const prefillCardFromRegister = useCallback((payload: OnboardingSubmitPayload) => {
    if (payload.name.trim()) setCardHolder(payload.name.trim());
    if (payload.email.trim()) setCardEmail(payload.email.trim());
    if (payload.document) setCardCpf(payload.document);
    if (payload.phone.trim()) setCardPhone(payload.phone);
  }, []);

  const applyCheckout = useCallback(
    (response: CheckoutSessionResponse, nextSession: NativeSession, fromRegister?: OnboardingSubmitPayload) => {
      setSession(nextSession);
      setPaymentId(response.payment?.id ?? null);
      setPaymentAmount(
        response.payment?.amountInCents ?? (selectedPlan ? getEffectivePriceCents(selectedPlan) : 0)
      );
      setNativeCheckout(response.nativeCheckout ?? null);
      setProviderError(response.paymentProviderError ?? null);
      if (response.nativeCheckout?.billingType === "CREDIT_CARD") {
        setPayBillingType("CREDIT_CARD");
      } else if (response.nativeCheckout?.billingType === "PIX") {
        setPayBillingType("PIX");
      }
      if (response.alreadyActive) {
        uiSounds.paymentApproved();
        void onLoggedIn(nextSession);
        return;
      }
      if (fromRegister) {
        prefillCardFromRegister(fromRegister);
        if (fromRegister.billingType === "PIX") setPayBillingType("PIX");
        if (fromRegister.billingType === "CREDIT_CARD" && selectedPlanAllowsCard) setPayBillingType("CREDIT_CARD");
      }
      autoPixStarted.current = false;
      setStep(3);
    },
    [onLoggedIn, prefillCardFromRegister, selectedPlan, selectedPlanAllowsCard]
  );

  const prepareCheckout = useCallback(
    async (nextSession: NativeSession, cpf?: string) => {
      const billingType =
        payBillingType === "CREDIT_CARD" && selectedPlanAllowsCard ? "CREDIT_CARD" : "PIX";
      const response = await apiPost<CheckoutSessionResponse>(
        "/checkout/session",
        {
          planCode,
          billingType,
          couponCode: checkoutCoupon,
          cpfCnpj: cpf
        },
        nextSession.token
      );
      applyCheckout(response, nextSession);
    },
    [applyCheckout, checkoutCoupon, payBillingType, planCode, selectedPlanAllowsCard]
  );

  const bootstrapResumeCheckout = useCallback(async () => {
    if (!resumeSession || !selectedPlan) return;
    setBusy(true);
    setError(null);
    setPendingNotice(null);
    setSession(resumeSession);

    const pendingRaw = resolvePendingPaymentForSelectedPlan(
      planCode,
      resumeMembership ?? null,
      resumePayments ?? [],
      resumeCheckoutPayment
    );
    const pending = pendingRaw && paymentMatchesPlanPricing(pendingRaw, selectedPlan) ? pendingRaw : null;

    if (pending) {
      setPaymentId(pending.id);
      setPaymentAmount(pending.amountInCents ?? getEffectivePriceCents(selectedPlan));
      setResumeCheckoutPayment(pending);

      try {
        const synced = await syncCheckoutPaymentStatus(resumeSession.token, pending.id);
        if (synced.alreadyActive || synced.payment.status === "CONFIRMED") {
          uiSounds.paymentApproved();
          await onLoggedIn(resumeSession);
          return;
        }
        if (synced.nativeCheckout) {
          setNativeCheckout(synced.nativeCheckout);
          if (synced.nativeCheckout.billingType === "CREDIT_CARD") setPayBillingType("CREDIT_CARD");
          else setPayBillingType("PIX");
          autoPixStarted.current = Boolean(synced.nativeCheckout.pix?.qrCodeBase64);
          return;
        }
      } catch {
        // segue para refresh de sessão abaixo
      }
    }

    autoPixStarted.current = false;
    try {
      await prepareCheckout(resumeSession);
    } catch (caught) {
      setError(caught instanceof NativeApiError ? caught.message : "Não foi possível retomar o pagamento.");
    }
  }, [
    onLoggedIn,
    planCode,
    prepareCheckout,
    resumeCheckoutPayment,
    resumeMembership,
    resumePayments,
    resumeSession,
    selectedPlan
  ]);

  useEffect(() => {
    if (!isResume || resumeCheckoutPayment) return;
    const pending = pickPendingCheckoutPayment(resumePayments ?? []);
    if (pending) setResumeCheckoutPayment(pending);
  }, [isResume, resumeCheckoutPayment, resumePayments]);

  useEffect(() => {
    if (!isResume || !resumeSession || resumeStarted.current || plansLoading || !planCode || !selectedPlan) return;
    resumeStarted.current = true;
    void bootstrapResumeCheckout().finally(() => setBusy(false));
  }, [bootstrapResumeCheckout, isResume, planCode, plansLoading, resumeSession, selectedPlan]);

  useEffect(() => {
    if (!paymentId || !selectedPlan) return;
    const payment =
      resumeCheckoutPayment?.id === paymentId
        ? resumeCheckoutPayment
        : (resumePayments ?? []).find((item) => item.id === paymentId) ?? null;
    if (payment && !paymentMatchesPlanPricing(payment, selectedPlan)) {
      setPaymentId(null);
      setNativeCheckout(null);
      setResumeCheckoutPayment(null);
      autoPixStarted.current = false;
    }
  }, [paymentId, resumeCheckoutPayment, resumePayments, selectedPlan]);

  function selectPlan(code: string) {
    if (code === planCode) return;
    uiSounds.radioSelect();
    setPlanCode(code);
    setPaymentId(null);
    setNativeCheckout(null);
    setResumeCheckoutPayment(null);
    setPendingNotice(null);
    autoPixStarted.current = false;
    void patchCheckoutIntent({
      planCode: code,
      couponCode: checkoutCoupon ?? undefined,
      referralSlug: referralSlug ?? undefined,
      source: "activate"
    });
  }

  useEffect(() => {
    if (isIosStoreCheckout() || step !== 3 || !session || autoPixStarted.current) return;
    if (payBillingType !== "PIX") return;
    if (nativeCheckout?.pix?.qrCodeBase64) return;
    autoPixStarted.current = true;
    const cpf = onlyDigits(cardCpf);
    setBusy(true);
    void prepareCheckout(session, cpf || undefined)
      .catch((caught) => {
        autoPixStarted.current = false;
        setError(caught instanceof NativeApiError ? caught.message : "Não foi possível gerar o Pix.");
      })
      .finally(() => setBusy(false));
  }, [cardCpf, nativeCheckout, payBillingType, prepareCheckout, session, step]);

  function applyCoupon() {
    const next = couponDraft.trim().toUpperCase();
    if (!next) return;
    setRejectedCouponCode(null);
    setCouponApplying(true);
    setCouponValidForSelection(null);
    setCouponFeedback(null);
    setAppliedCoupon(next);
    setCouponDraft("");
    uiSounds.toggleOn();
  }

  function removeCoupon() {
    setAppliedCoupon(null);
    setCouponValidForSelection(false);
    setCouponApplying(false);
    setCouponDraft("");
    setLoadedCouponCode(null);
    setCouponFeedback(null);
    setRejectedCouponCode(null);
    void patchCheckoutIntent({ couponCode: undefined, source: "activate" });
    uiSounds.toggleOff();
  }

  async function submitOnboarding(payload: OnboardingSubmitPayload) {
    setError(null);
    if (!selectedPlan) {
      setError("Selecione um plano.");
      return;
    }
    if (!canCheckoutSelectedPlan) {
      setError("Este plano não atinge o valor mínimo para pagamento online.");
      return;
    }
    if (couponBlocksCheckout) {
      setError("Aguarde a validação do cupom.");
      return;
    }

    setBusy(true);
    try {
      await patchCheckoutIntent({
        planCode: selectedPlan.code,
        couponCode: checkoutCoupon ?? undefined,
        referralSlug: referralSlug ?? undefined,
        source: "activate"
      });
      const response = await apiPost<CheckoutRegisterResponse>("/checkout/register", {
        name: payload.name.trim(),
        email: payload.email.trim() || undefined,
        phone: onlyDigits(payload.phone) || undefined,
        document: onlyDigits(payload.document),
        password: payload.password,
        gender: payload.gender,
        birthDate: payload.birthDate,
        objective: payload.objective,
        level: levelLabel(payload.level),
        daysPerWeek: payload.daysPerWeekNumber,
        equipmentTags: payload.equipment,
        planCode: selectedPlan.code,
        billingType: payload.billingType,
        couponCode: checkoutCoupon,
        referralSlug: referralSlug ?? undefined,
        acceptTerms: payload.acceptTerms,
        acceptPrivacy: payload.acceptPrivacy
      });
      uiSounds.success();
      const nextSession: NativeSession = {
        token: response.token,
        user: {
          id: response.user.id,
          name: response.user.name,
          email: response.user.email ?? "",
          role: response.user.role
        }
      };
      applyCheckout(response, nextSession, payload);
    } catch (caught) {
      uiSounds.error();
      setError(caught instanceof NativeApiError ? caught.message : "Não foi possível criar sua conta.");
    } finally {
      setBusy(false);
    }
  }

  async function submitLogin() {
    setError(null);
    if (couponBlocksCheckout) {
      setError("Aguarde a validação do cupom.");
      return;
    }
    if (!loginId.trim() || loginPassword.length < 6) {
      setError("Informe e-mail/telefone e senha.");
      return;
    }
    setBusy(true);
    try {
      const nextSession = await loginWithPassword(loginId, loginPassword);
      const cpf = onlyDigits(loginDocument) || undefined;
      await prepareCheckout(nextSession, cpf);
      uiSounds.success();
    } catch (caught) {
      uiSounds.error();
      setError(caught instanceof NativeApiError ? caught.message : "Não foi possível entrar.");
    } finally {
      setBusy(false);
    }
  }

  async function prepareCardCheckout() {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      setPayBillingType("CREDIT_CARD");
      const cpf = onlyDigits(cardCpf);
      const response = await apiPost<CheckoutSessionResponse>(
        "/checkout/session",
        {
          planCode,
          billingType: "CREDIT_CARD",
          couponCode: checkoutCoupon,
          cpfCnpj: cpf || undefined
        },
        session.token
      );
      applyCheckout(response, session);
      uiSounds.info();
    } catch (caught) {
      uiSounds.error();
      setError(caught instanceof NativeApiError ? caught.message : "Não foi possível iniciar o checkout com cartão.");
    } finally {
      setBusy(false);
    }
  }

  async function generatePix() {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      setPayBillingType("PIX");
      const cpf = onlyDigits(cardCpf);
      await prepareCheckout(session, cpf || undefined);
      uiSounds.info();
    } catch (caught) {
      uiSounds.error();
      setError(caught instanceof NativeApiError ? caught.message : "Não foi possível gerar o Pix.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyPaymentNow() {
    if (!session?.token || !paymentId) return;
    setBusy(true);
    setPendingNotice(null);
    try {
      const response = await syncCheckoutPaymentStatus(session.token, paymentId);
      if (response.nativeCheckout) setNativeCheckout(response.nativeCheckout);
      if (response.alreadyActive || response.payment.status === "CONFIRMED") {
        uiSounds.paymentApproved();
        await onLoggedIn(session);
        return;
      }
      if (response.payment.status === "PENDING") {
        setPendingNotice(
          "Pagamento recebido. Aguardando confirmação final — toque em verificar novamente em instantes."
        );
        uiSounds.info();
      } else {
        Alert.alert("Pagamento", "Ainda não confirmamos o pagamento. Aguarde alguns instantes e tente novamente.");
      }
      await onRefresh?.();
    } catch (caught) {
      Alert.alert("Pagamento", caught instanceof NativeApiError ? caught.message : "Não foi possível verificar agora.");
    } finally {
      setBusy(false);
    }
  }

  async function submitCard() {
    if (!session || !paymentId) return;
    setBusy(true);
    setError(null);
    try {
      const response = await apiPost<{ alreadyActive?: boolean; payment?: { status?: string } }>(
        `/checkout/payments/${paymentId}/card`,
        {
          holderName: cardHolder.trim(),
          number: onlyDigits(cardNumber),
          expiryMonth: cardMonth.padStart(2, "0"),
          expiryYear: cardYear.length === 2 ? `20${cardYear}` : cardYear,
          ccv: cardCcv,
          holderEmail: cardEmail.trim(),
          holderCpfCnpj: onlyDigits(cardCpf),
          holderPostalCode: onlyDigits(cardCep),
          holderAddressNumber: cardNumberAddr.trim(),
          holderPhone: onlyDigits(cardPhone),
          installmentCount: selectedPlanAllowsCard ? installmentCount : 1
        },
        session.token
      );
      if (response.alreadyActive || response.payment?.status === "CONFIRMED") {
        uiSounds.paymentApproved();
        await onLoggedIn(session);
        return;
      }
      uiSounds.info();
      Alert.alert("Pagamento", "Estamos processando seu cartão. Aguarde a confirmação.");
    } catch (caught) {
      uiSounds.error();
      setError(caught instanceof NativeApiError ? caught.message : "Não foi possível processar o cartão.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmSandbox() {
    if (!session || !paymentId) return;
    setBusy(true);
    try {
      await apiPost("/checkout/confirm-sandbox", { paymentId }, session.token);
      uiSounds.paymentApproved();
      await onLoggedIn(session);
    } catch (caught) {
      uiSounds.error();
      Alert.alert("Sandbox", caught instanceof NativeApiError ? caught.message : "Falha ao confirmar sandbox.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (session?.user.id) {
      void configureAppleIap(session.user.id);
    }
  }, [session?.user.id]);

  useEffect(() => {
    if (isIosStoreCheckout() || step !== 3 || !session?.token || !paymentId) return;
    const timer = setInterval(() => {
      void syncCheckoutPaymentStatus(session.token, paymentId)
        .then((response) => {
          if (response.nativeCheckout && !nativeCheckout?.pix?.qrCodeBase64) {
            setNativeCheckout(response.nativeCheckout);
          }
          if (response.alreadyActive || response.payment.status === "CONFIRMED") {
            uiSounds.paymentApproved();
            void onLoggedIn(session);
            return;
          }
          if (response.payment.status === "PENDING" && response.syncedFromAsaas) {
            setPendingNotice(
              "Pagamento recebido. Aguardando confirmação final — liberamos seu acesso assim que concluir."
            );
            void onRefresh?.();
          }
        })
        .catch(() => undefined);
    }, 2500);
    return () => clearInterval(timer);
  }, [nativeCheckout?.pix?.qrCodeBase64, onLoggedIn, onRefresh, paymentId, session, step]);

  const pixPayload = nativeCheckout?.pix;
  const styles = useMemo(() => createStyles(), []);
  const handleBack = onBack ?? onLogout;
  const showPlanStage = step === 1 || step === 3;
  const showCouponApplied = Boolean(
    rejectedCouponCode || (appliedCoupon && (couponValidForSelection === true || couponValidForSelection === null))
  );
  const visibleCouponCode = rejectedCouponCode ?? appliedCoupon;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
      <ActivateCheckoutShell
        compactStory={step >= 2}
        title={
          isResume
            ? `Olá, ${resumeProfile?.name?.split(" ")[0] ?? resumeSession?.user.name?.split(" ")[0] ?? "atleta"}`
            : "Ative seu sistema"
        }
        subtitle={
          isResume
            ? "Conclua o pagamento para liberar treinos, corrida, IA e comunidade."
            : brand.commandLine
        }
      >
          {handleBack ? (
            <Pressable onPress={handleBack} style={styles.backWrap}>
              <Text style={styles.back}>{isResume && onLogout ? "Sair da conta" : "← Voltar"}</Text>
            </Pressable>
          ) : null}

          {referralSlug ? <Text style={styles.referral}>Indicação: {referralSlug}</Text> : null}

          <AtllyStepper steps={STEP_LABELS} current={step} />

          {error ? <Text style={styles.error}>{error}</Text> : null}
          {pendingNotice ? <Text style={styles.notice}>{pendingNotice}</Text> : null}
          {providerError ? <Text style={styles.warn}>{providerError}</Text> : null}
          {couponFeedback && !rejectedCouponCode ? (
            <Text style={styles.error}>{couponFeedback}</Text>
          ) : null}

          {showPlanStage ? (
            <ActivateStepTransition stepKey={`plan-${step}`}>
            <AtllyCinemaPanel title="Escolha seu plano">
              <Text style={styles.stageCopy}>Acesso imediato após confirmação do pagamento.</Text>
              {plansLoading && displayPlans.length === 0 ? <ActivityIndicator color={cinema.gold} /> : null}
              {!plansLoading && displayPlans.length === 0 ? (
                <Text style={styles.hint}>Nenhum plano disponível no momento.</Text>
              ) : null}
              {displayPlans.map((plan) => (
                <ActivatePlanCard
                  key={plan.code}
                  plan={plan}
                  monthlyBaseline={monthlyBaseline}
                  selected={planCode === plan.code}
                  onSelect={() => selectPlan(plan.code)}
                />
              ))}

              {allowsAsaasCheckout() ? (
              <View style={styles.couponBox}>
                {showCouponApplied && visibleCouponCode ? (
                  <View style={styles.couponAppliedRow}>
                    <Text
                      style={[
                        styles.couponApplied,
                        rejectedCouponCode ? styles.couponRejected : null,
                        couponApplying ? styles.couponValidating : null,
                        couponValidForSelection === true ? styles.couponOk : null
                      ]}
                    >
                      Cupom <Text style={styles.couponStrong}>{visibleCouponCode}</Text>{" "}
                      {rejectedCouponCode
                        ? "inválido"
                        : couponApplying
                          ? "validando…"
                          : "aplicado"}
                    </Text>
                    {couponValidForSelection === true ? (
                      <Pressable onPress={removeCoupon}>
                        <Text style={styles.couponRemove}>Remover</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : (
                  <>
                    <Text style={styles.fieldLabel}>Tem um cupom?</Text>
                    <View style={styles.couponRow}>
                      <TextInput
                        value={couponDraft}
                        onChangeText={(value) => setCouponDraft(value.toUpperCase())}
                        placeholder="Código"
                        placeholderTextColor={cinema.faint}
                        autoCapitalize="characters"
                        editable={!couponApplying}
                        style={styles.input}
                      />
                      <Pressable
                        style={[styles.couponBtn, (!couponDraft.trim() || couponApplying) && styles.couponBtnDisabled]}
                        disabled={!couponDraft.trim() || couponApplying}
                        onPress={applyCoupon}
                      >
                        <Text style={styles.couponBtnText}>{couponApplying ? "…" : "Aplicar"}</Text>
                      </Pressable>
                    </View>
                  </>
                )}
              </View>
              ) : null}

              {step === 1 ? (
                <AtllyPrimaryButton
                  label="Ativar agora"
                  disabled={!selectedPlan || !canCheckoutSelectedPlan || couponBlocksCheckout}
                  onPress={() => {
                    uiSounds.submit();
                    setStep(2);
                  }}
                  style={styles.cta}
                />
              ) : null}
            </AtllyCinemaPanel>
            </ActivateStepTransition>
          ) : null}

          {step === 2 ? (
            <ActivateStepTransition stepKey="account">
            <AtllyCinemaPanel title="Conta ATLLY">
              {isResume && resumeProfile ? (
                <ActivateAccountReview
                  profile={resumeProfile}
                  planName={selectedPlan?.name}
                  onContinue={() => {
                    uiSounds.submit();
                    setStep(3);
                  }}
                />
              ) : (
                <>
                  {selectedPlan ? (
                    <Text style={styles.hint}>
                      Plano: {selectedPlan.name} · {money(getEffectivePriceCents(selectedPlan))}
                    </Text>
                  ) : null}

                  <View style={styles.tabs}>
                    <Pressable
                      style={[styles.tab, accountMode === "register" && styles.tabOn]}
                      onPress={() => setAccountMode("register")}
                    >
                      <Text style={[styles.tabText, accountMode === "register" && styles.tabTextOn]}>Criar conta</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.tab, accountMode === "login" && styles.tabOn]}
                      onPress={() => setAccountMode("login")}
                    >
                      <Text style={[styles.tabText, accountMode === "login" && styles.tabTextOn]}>Já tenho conta</Text>
                    </Pressable>
                  </View>

                  {accountMode === "register" ? (
                    <WorkoutOnboardingForm
                      selectedPlanName={selectedPlan?.name}
                      submitting={busy}
                      error={error}
                      onSubmit={submitOnboarding}
                      onCancel={() => setStep(1)}
                    />
                  ) : (
                    <>
                      <Field label="E-mail ou telefone" value={loginId} onChangeText={setLoginId} autoCapitalize="none" />
                      <Field label="Senha" value={loginPassword} onChangeText={setLoginPassword} secureTextEntry />
                      <Field
                        label="CPF (se ainda não cadastrou)"
                        value={loginDocument}
                        onChangeText={(v) => setLoginDocument(formatCpf(v))}
                        keyboardType="number-pad"
                      />
                      <AtllyPrimaryButton
                        label="Entrar e concluir assinatura"
                        loading={busy}
                        disabled={busy || couponBlocksCheckout}
                        onPress={() => void submitLogin()}
                        style={styles.cta}
                      />
                    </>
                  )}

                  {accountMode === "login" ? (
                    <AtllyGhostLink label="← Alterar plano" onPress={() => setStep(1)} />
                  ) : null}
                </>
              )}
            </AtllyCinemaPanel>
            </ActivateStepTransition>
          ) : null}

          {step === 3 && session ? (
            <ActivateStepTransition stepKey="payment">
            <AtllyCinemaPanel title="Finalize sua ativação">
              {isResume && resumeProfile ? (
                <AtllyGhostLink label="Revisar dados da conta" onPress={() => setStep(2)} />
              ) : null}

              {isIosStoreCheckout() && selectedPlan ? (
                <AppleIapPanel
                  session={session}
                  selectedPlan={selectedPlan}
                  onSuccess={() => onLoggedIn(session)}
                  onError={setError}
                />
              ) : (
                <>
              {busy && !pixPayload?.qrCodeBase64 && payBillingType === "PIX" ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator color={cinema.gold} />
                  <Text style={styles.hint}>Preparando checkout…</Text>
                </View>
              ) : null}

              <Text style={styles.hint}>
                {selectedPlan?.name ?? "Plano"} ·{" "}
                {money(paymentAmount || (selectedPlan ? getEffectivePriceCents(selectedPlan) : 0))}
              </Text>
              <Text style={styles.secureCopy}>Pagamento seguro sem sair da ATLLY.</Text>

              {isResume && resumeCheckoutPayment ? (
                <View style={styles.pendingBanner}>
                  <Text style={styles.pendingBannerText}>
                    Retomando pagamento pendente — use o QR abaixo ou toque em verificar se já pagou.
                  </Text>
                </View>
              ) : null}

              <View style={styles.chips}>
                <Pressable
                  style={[styles.chip, payBillingType === "PIX" && styles.chipOn]}
                  onPress={() => {
                    setPayBillingType("PIX");
                    autoPixStarted.current = false;
                  }}
                >
                  <Text style={[styles.chipText, payBillingType === "PIX" && styles.chipTextOn]}>Pix</Text>
                </Pressable>
                {selectedPlanAllowsCard ? (
                  <Pressable
                    style={[styles.chip, payBillingType === "CREDIT_CARD" && styles.chipOn]}
                    onPress={() => setPayBillingType("CREDIT_CARD")}
                  >
                    <Text style={[styles.chipText, payBillingType === "CREDIT_CARD" && styles.chipTextOn]}>
                      Cartão de crédito
                    </Text>
                  </Pressable>
                ) : null}
              </View>

              {payBillingType === "PIX" ? (
                <>
                  {pixPayload?.qrCodeBase64 ? (
                    <Image
                      source={{ uri: `data:image/png;base64,${pixPayload.qrCodeBase64}` }}
                      style={styles.qr}
                      accessibilityLabel="QR Code Pix"
                    />
                  ) : (
                    <AtllySecondaryButton label="Gerar QR Code Pix" loading={busy} disabled={busy} onPress={() => void generatePix()} />
                  )}
                  {pixPayload?.expiresAt ? (
                    <Text style={styles.hint}>Expira em {new Date(pixPayload.expiresAt).toLocaleString("pt-BR")}</Text>
                  ) : null}
                  {pixPayload?.copyPaste ? (
                    <AtllySecondaryButton
                      label="Copiar código Pix"
                      onPress={() => {
                        void Share.share({ message: pixPayload.copyPaste });
                        uiSounds.info();
                      }}
                    />
                  ) : null}
                  {paymentId ? (
                    <AtllyGhostLink label="Já paguei — verificar agora" onPress={() => void verifyPaymentNow()} />
                  ) : null}
                  <Text style={styles.hint}>O acesso libera automaticamente após a confirmação do pagamento.</Text>
                </>
              ) : (
                <>
                  <Image
                    source={require("../../assets/payments-card-brands.png")}
                    style={styles.cardBrands}
                    resizeMode="contain"
                    accessibilityLabel="Bandeiras de cartão aceitas"
                  />

                  {!paymentId ? (
                    <AtllySecondaryButton
                      label="Continuar com cartão de crédito"
                      loading={busy}
                      disabled={busy}
                      onPress={() => void prepareCardCheckout()}
                    />
                  ) : (
                    <>
                  {installmentOptions.length > 1 ? (
                    <>
                      <Text style={styles.fieldLabel}>Parcelamento</Text>
                      <View style={styles.chips}>
                        {installmentOptions.map((count) => (
                          <Pressable
                            key={count}
                            style={[styles.chip, installmentCount === count && styles.chipOn]}
                            onPress={() => setInstallmentCount(count)}
                          >
                            <Text style={[styles.chipText, installmentCount === count && styles.chipTextOn]}>
                              {formatCardInstallmentLabel(count, paymentAmount || getEffectivePriceCents(selectedPlan!))}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </>
                  ) : null}

                  <Field label="Nome no cartão" value={cardHolder} onChangeText={setCardHolder} />
                  <Field label="Número do cartão" value={cardNumber} onChangeText={setCardNumber} keyboardType="number-pad" />
                  <View style={styles.row}>
                    <View style={styles.rowField}>
                      <Field label="Mês" value={cardMonth} onChangeText={setCardMonth} keyboardType="number-pad" />
                    </View>
                    <View style={styles.rowField}>
                      <Field label="Ano" value={cardYear} onChangeText={setCardYear} keyboardType="number-pad" />
                    </View>
                    <View style={styles.rowField}>
                      <Field label="CVV" value={cardCcv} onChangeText={setCardCcv} keyboardType="number-pad" secureTextEntry />
                    </View>
                  </View>
                  <Field label="E-mail do titular" value={cardEmail} onChangeText={setCardEmail} autoCapitalize="none" keyboardType="email-address" />
                  <Field label="CPF do titular" value={cardCpf} onChangeText={(v) => setCardCpf(formatCpf(v))} keyboardType="number-pad" />
                  <Field label="CEP" value={cardCep} onChangeText={setCardCep} keyboardType="number-pad" />
                  <Field label="Número" value={cardNumberAddr} onChangeText={setCardNumberAddr} />
                  <Field label="Telefone" value={cardPhone} onChangeText={setCardPhone} keyboardType="phone-pad" />
                  <AtllyPrimaryButton
                    label={
                      installmentCount > 1
                        ? `Pagar ${installmentCount}× no cartão`
                        : "Pagar com cartão"
                    }
                    loading={busy}
                    disabled={busy}
                    onPress={() => void submitCard()}
                    style={styles.cta}
                  />
                    </>
                  )}
                </>
              )}

              {(__DEV__ || process.env.EXPO_PUBLIC_ENABLE_SANDBOX_CONFIRM === "true") && paymentId ? (
                <AtllyGhostLink label="Finalizar sandbox (dev)" onPress={() => void confirmSandbox()} />
              ) : null}
                </>
              )}
            </AtllyCinemaPanel>
            </ActivateStepTransition>
          ) : null}

          <ActivateFunnelFooter />
      </ActivateCheckoutShell>
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  value,
  onChangeText,
  secureTextEntry,
  keyboardType,
  autoCapitalize
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  secureTextEntry?: boolean;
  keyboardType?: "default" | "email-address" | "phone-pad" | "number-pad";
  autoCapitalize?: "none" | "sentences";
}) {
  return (
    <>
      <Text style={fieldStyles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        placeholderTextColor={cinema.faint}
        style={fieldStyles.input}
      />
    </>
  );
}

const fieldStyles = StyleSheet.create({
  label: { color: cinema.gold, fontSize: 12, fontWeight: "800", marginTop: 8, textTransform: "uppercase" },
  input: {
    borderWidth: 1,
    borderColor: cinema.lineStrong,
    borderRadius: 12,
    color: cinema.text,
    fontSize: 16,
    marginTop: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: cinema.inputBg
  },
});

function createStyles() {
  return StyleSheet.create({
    flex: { flex: 1 },
    backWrap: { marginBottom: 4 },
    back: { color: cinema.gold, fontSize: 15, fontWeight: "700" },
    referral: { color: cinema.faint, fontSize: 12, fontWeight: "700" },
    stageCopy: { color: cinema.muted, fontSize: 14, lineHeight: 20, marginBottom: 4 },
    secureCopy: { color: cinema.faint, fontSize: 12, fontWeight: "700", letterSpacing: 0.3 },
    error: { color: cinema.error, fontWeight: "700" },
    notice: { color: "#86efac", fontWeight: "700", lineHeight: 20 },
    pendingBanner: {
      borderWidth: 1,
      borderColor: "rgba(134,239,172,0.35)",
      backgroundColor: "rgba(134,239,172,0.08)",
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 10
    },
    pendingBannerText: { color: "#bbf7d0", fontSize: 13, lineHeight: 19, fontWeight: "700" },
    warn: { color: cinema.warn, fontWeight: "700" },
    fieldLabel: { color: cinema.gold, fontSize: 12, fontWeight: "800", marginTop: 8, textTransform: "uppercase" },
    couponBox: { gap: 8, marginTop: 4 },
    couponRow: { flexDirection: "row", gap: 8, alignItems: "center" },
    couponAppliedRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
    couponApplied: { color: cinema.muted, fontSize: 14, flex: 1 },
    couponStrong: { color: cinema.text, fontWeight: "900" },
    couponOk: { color: "#86efac" },
    couponValidating: { color: cinema.warn },
    couponRejected: { color: "#ffb4a8" },
    couponRemove: { color: cinema.gold, fontWeight: "800" },
    input: {
      flex: 1,
      borderWidth: 1,
      borderColor: cinema.lineStrong,
      borderRadius: 12,
      color: cinema.text,
      fontSize: 16,
      paddingHorizontal: 14,
      paddingVertical: 12,
      backgroundColor: cinema.inputBg
    },
    couponBtn: {
      backgroundColor: cinema.coral,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12
    },
    couponBtnDisabled: { opacity: 0.55 },
    couponBtnText: { color: "#fff", fontWeight: "900" },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
    chip: { borderWidth: 1, borderColor: cinema.lineStrong, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
    chipOn: { backgroundColor: cinema.coral, borderColor: cinema.coral },
    chipText: { color: cinema.text, fontWeight: "800", fontSize: 12 },
    chipTextOn: { color: "#fff" },
    cta: { marginTop: 8 },
    tabs: { flexDirection: "row", gap: 8, marginVertical: 8 },
    tab: {
      flex: 1,
      borderWidth: 1,
      borderColor: cinema.lineStrong,
      borderRadius: 12,
      paddingVertical: 10,
      alignItems: "center"
    },
    tabOn: { borderColor: cinema.coral, backgroundColor: "rgba(223,102,60,0.12)" },
    tabText: { color: cinema.muted, fontWeight: "800" },
    tabTextOn: { color: cinema.text },
    hint: { color: cinema.faint, fontSize: 13, lineHeight: 18 },
    loadingRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    qr: { width: 220, height: 220, alignSelf: "center", marginTop: 8, borderRadius: 12, backgroundColor: "#fff" },
    cardBrands: { width: "100%", height: 34, marginTop: 4, opacity: 0.95 },
    row: { flexDirection: "row", gap: 8 },
    rowField: { flex: 1 }
  });
}
