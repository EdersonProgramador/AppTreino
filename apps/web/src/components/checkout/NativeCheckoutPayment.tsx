import { Check, Copy, CreditCard, Loader2, QrCode, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { formatCpf, formatPriceInBRL, isValidCpf } from "@app-treino/shared";
import { apiGet, apiPost } from "../../api";
import type { CheckoutSessionResponse, NativeCheckoutPayload, PaymentRow } from "../../types/shared";
import { brand } from "../../lib/brand";
import {
  defaultAnnualInstallmentCount,
  formatCardInstallmentLabel,
  listAnnualInstallmentCounts,
  planAllowsCreditCardCheckout
} from "../../lib/plan-catalog";
import { CardBrandsImage, TrustBadgesImage } from "./PaymentMethodArt";

export type NativeBillingType = "PIX" | "CREDIT_CARD";

export type NativeCheckoutPrepareInput = {
  cpfCnpj?: string;
};

type NativeCheckoutPaymentProps = {
  token: string;
  planName: string;
  amountInCents: number;
  billingCycle?: "MONTHLY" | "YEARLY";
  payment: PaymentRow | null;
  nativeCheckout: NativeCheckoutPayload | null;
  billingType: NativeBillingType | null;
  onBillingTypeChange: (value: NativeBillingType) => void;
  loading?: boolean;
  error?: string | null;
  defaultEmail?: string | null;
  defaultPhone?: string | null;
  defaultName?: string | null;
  defaultDocument?: string | null;
  onSessionResponse: (response: CheckoutSessionResponse) => void;
  onPaymentConfirmed: () => void;
  onError: (message: string) => void;
  onPrepareCheckout?: (input?: NativeCheckoutPrepareInput) => void;
  prepareDisabled?: boolean;
};

type CardFormState = {
  holderName: string;
  number: string;
  expiryMonth: string;
  expiryYear: string;
  ccv: string;
  holderEmail: string;
  holderCpfCnpj: string;
  holderPostalCode: string;
  holderAddressNumber: string;
  holderPhone: string;
};

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

function formatCardNumber(value: string) {
  return onlyDigits(value)
    .slice(0, 16)
    .replace(/(\d{4})(?=\d)/g, "$1 ")
    .trim();
}

function formatPhone(value: string) {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 10) {
    return digits.replace(/(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3").trim();
  }
  return digits.replace(/(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3").trim();
}

function formatCep(value: string) {
  const digits = onlyDigits(value).slice(0, 8);
  return digits.replace(/(\d{5})(\d{0,3})/, "$1-$2");
}

export function NativeCheckoutPayment({
  token,
  planName,
  amountInCents,
  billingCycle = "MONTHLY",
  payment,
  nativeCheckout,
  billingType,
  onBillingTypeChange,
  loading = false,
  error,
  defaultEmail,
  defaultPhone,
  defaultName,
  defaultDocument,
  onSessionResponse,
  onPaymentConfirmed,
  onError,
  onPrepareCheckout,
  prepareDisabled = false
}: NativeCheckoutPaymentProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const [cardSubmitting, setCardSubmitting] = useState(false);
  const [pixVerifying, setPixVerifying] = useState(false);
  const [pixConfirmed, setPixConfirmed] = useState(false);
  const isAnnualPlan = planAllowsCreditCardCheckout({ billingCycle });
  const installmentOptions = useMemo(
    () => (isAnnualPlan ? listAnnualInstallmentCounts(amountInCents) : [1]),
    [amountInCents, isAnnualPlan]
  );
  const [installmentCount, setInstallmentCount] = useState(() =>
    isAnnualPlan ? defaultAnnualInstallmentCount(amountInCents) : 1
  );
  const storedDocument = useMemo(() => onlyDigits(defaultDocument ?? ""), [defaultDocument]);
  const hasStoredDocument = isValidCpf(storedDocument);
  const [pixCpf, setPixCpf] = useState(() => (hasStoredDocument ? formatCpf(storedDocument) : ""));
  const [cardForm, setCardForm] = useState<CardFormState>({
    holderName: defaultName ?? "",
    number: "",
    expiryMonth: "",
    expiryYear: "",
    ccv: "",
    holderEmail: defaultEmail ?? "",
    holderCpfCnpj: hasStoredDocument ? formatCpf(storedDocument) : "",
    holderPostalCode: "",
    holderAddressNumber: "",
    holderPhone: defaultPhone ?? ""
  });

  const pixPayload = nativeCheckout?.billingType === "PIX" ? nativeCheckout.pix : null;
  const waitingPix = Boolean(payment?.id && pixPayload && payment.status === "PENDING" && !pixConfirmed);

  async function pollPixPaymentStatus(options?: { manual?: boolean }) {
    if (!payment?.id) return false;

    if (options?.manual) {
      setPixVerifying(true);
    }

    try {
      const response = await apiGet<{
        payment: PaymentRow;
        alreadyActive: boolean;
      }>(`/checkout/payments/${payment.id}/status`, token);

      if (response.alreadyActive || response.payment?.status === "CONFIRMED") {
        setPixConfirmed(true);
        onPaymentConfirmed();
        return true;
      }
    } catch {
      if (options?.manual) {
        onError("Não foi possível verificar o Pix agora. Tente novamente em alguns segundos.");
      }
    } finally {
      if (options?.manual) {
        setPixVerifying(false);
      }
    }

    return false;
  }

  useEffect(() => {
    if (!isAnnualPlan) {
      setInstallmentCount(1);
      return;
    }
    setInstallmentCount((current) =>
      installmentOptions.includes(current) ? current : defaultAnnualInstallmentCount(amountInCents)
    );
  }, [amountInCents, installmentOptions, isAnnualPlan]);

  useEffect(() => {
    if (isAnnualPlan) return;
    if (billingType !== "PIX") {
      onBillingTypeChange("PIX");
    }
  }, [billingType, isAnnualPlan, onBillingTypeChange]);

  useEffect(() => {
    if (!payment?.id || !waitingPix) return;

    let cancelled = false;
    void pollPixPaymentStatus();

    const interval = window.setInterval(() => {
      if (cancelled) return;
      void pollPixPaymentStatus();
    }, 2500);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [payment?.id, waitingPix, token, onPaymentConfirmed]);

  const summaryLine = useMemo(
    () => `${planName} · ${formatPriceInBRL(amountInCents)}`,
    [amountInCents, planName]
  );

  const cardPayLabel = useMemo(() => {
    if (!isAnnualPlan || installmentCount === 1) {
      return `Pagar ${formatPriceInBRL(amountInCents)} com cartão de crédito`;
    }
    const installmentValueCents = Math.ceil(amountInCents / installmentCount);
    return `Pagar ${installmentCount}× de ${formatPriceInBRL(installmentValueCents)}`;
  }, [amountInCents, installmentCount, isAnnualPlan]);

  async function handleCopyPix() {
    if (!pixPayload?.copyPaste) return;
    try {
      await navigator.clipboard.writeText(pixPayload.copyPaste);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 2200);
    } catch {
      onError("Não foi possível copiar o código Pix.");
    }
  }

  async function handleSubmitCard(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!payment?.id) {
      onError("Gere o pagamento antes de enviar o cartão.");
      return;
    }

    setCardSubmitting(true);
    try {
      const response = await apiPost<CheckoutSessionResponse>(
        `/checkout/payments/${payment.id}/card`,
        {
          holderName: cardForm.holderName.trim(),
          number: onlyDigits(cardForm.number),
          expiryMonth: cardForm.expiryMonth.trim(),
          expiryYear: cardForm.expiryYear.trim(),
          ccv: cardForm.ccv.trim(),
          holderEmail: cardForm.holderEmail.trim(),
          holderCpfCnpj: onlyDigits(cardForm.holderCpfCnpj),
          holderPostalCode: onlyDigits(cardForm.holderPostalCode),
          holderAddressNumber: cardForm.holderAddressNumber.trim(),
          holderPhone: onlyDigits(cardForm.holderPhone),
          installmentCount: isAnnualPlan ? installmentCount : 1
        },
        token
      );

      onSessionResponse(response);
      if (response.alreadyActive || response.payment?.status === "CONFIRMED") {
        onPaymentConfirmed();
        return;
      }
      if (response.paymentProviderError) {
        onError(response.paymentProviderError);
      }
    } catch (submitError) {
      onError(submitError instanceof Error ? submitError.message : "Não foi possível processar o cartão.");
    } finally {
      setCardSubmitting(false);
    }
  }

  const cardReady = Boolean(payment?.id);
  const prepareCheckoutDisabled = loading || prepareDisabled || !onPrepareCheckout;
  const pixCpfDigits = onlyDigits(pixCpf);
  const pixCpfReady = hasStoredDocument || isValidCpf(pixCpfDigits);
  const pixPrepareDisabled = prepareCheckoutDisabled || !pixCpfReady;

  function handlePreparePixCheckout() {
    if (!onPrepareCheckout) return;
    if (!pixCpfReady) {
      onError("Informe um CPF válido para gerar o Pix.");
      return;
    }
    onPrepareCheckout({
      cpfCnpj: hasStoredDocument ? storedDocument : pixCpfDigits
    });
  }

  function handlePrepareCardCheckout() {
    onPrepareCheckout?.();
  }

  return (
    <div className="native-checkout">
      <div className="native-checkout__summary">
        <span className="native-checkout__eyebrow">{brand.name} Checkout</span>
        <strong>{summaryLine}</strong>
        <p>Pagamento seguro sem sair do {brand.name}.</p>
      </div>

      <div
        className={`native-checkout__methods${isAnnualPlan ? "" : " native-checkout__methods--single"}`}
        role="tablist"
        aria-label="Forma de pagamento"
      >
        <button
          type="button"
          role="tab"
          aria-selected={billingType === "PIX"}
          className={`native-checkout__method native-checkout__method--pix${billingType === "PIX" ? " is-active" : ""}`}
          onClick={() => onBillingTypeChange("PIX")}
        >
          <span className="native-checkout__method-icon native-checkout__method-icon--pix" aria-hidden="true">
            <QrCode size={26} strokeWidth={1.75} />
          </span>
          <span className="native-checkout__method-copy">
            <strong>Pix</strong>
            <small>Aprovação imediata</small>
          </span>
        </button>
        {isAnnualPlan ? (
          <button
            type="button"
            role="tab"
            aria-selected={billingType === "CREDIT_CARD"}
            className={`native-checkout__method native-checkout__method--card${billingType === "CREDIT_CARD" ? " is-active" : ""}`}
            onClick={() => onBillingTypeChange("CREDIT_CARD")}
          >
            <span className="native-checkout__method-icon native-checkout__method-icon--card" aria-hidden="true">
              <CreditCard size={26} strokeWidth={1.75} />
            </span>
            <span className="native-checkout__method-copy">
              <strong>Cartão de crédito</strong>
              <small>Visa, Master, Elo</small>
            </span>
          </button>
        ) : null}
      </div>

      {error ? <div className="activate-funnel-error">{error}</div> : null}

      {!billingType ? (
        <div className="native-checkout__panel native-checkout__panel--idle">
          <p className="native-checkout__idle-copy">
            {isAnnualPlan
              ? "Escolha Pix ou cartão de crédito para continuar o pagamento."
              : "Use Pix para continuar o pagamento."}
          </p>
        </div>
      ) : billingType === "PIX" ? (
        <div className="native-checkout__panel native-checkout__panel--pix">
          {!pixPayload ? (
            <div className="native-checkout__empty">
              <strong>Pague com Pix</strong>
              <p>Gere o QR Code e conclua no app do seu banco.</p>
              {!hasStoredDocument ? (
                <label className="native-checkout__field native-checkout__full">
                  <span className="native-checkout__label">CPF do titular</span>
                  <input
                    className="native-checkout__input"
                    value={pixCpf}
                    onChange={(event) => setPixCpf(formatCpf(event.target.value))}
                    placeholder="000.000.000-00"
                    inputMode="numeric"
                    autoComplete="off"
                    required
                  />
                  <span className="native-checkout__hint">Obrigatório para emissão da cobrança Pix.</span>
                </label>
              ) : (
                <p className="native-checkout__hint">CPF cadastrado: {formatCpf(storedDocument)}</p>
              )}
              <button
                type="button"
                className="ui-btn-primary activate-funnel-cta native-checkout__empty-cta native-checkout__cta native-checkout__cta--pix"
                onClick={handlePreparePixCheckout}
                disabled={pixPrepareDisabled}
              >
                {loading ? <Loader2 className="spin" size={18} /> : null}
                Gerar QR Code Pix
              </button>
            </div>
          ) : (
            <>
              <div className="native-checkout__qr-header">
                <div>
                  <strong>Escaneie o QR Code</strong>
                  <p>Abra o app do banco e aponte a câmera.</p>
                </div>
              </div>
              <div className="native-checkout__qr-wrap">
                <img
                  className="native-checkout__qr"
                  src={`data:image/png;base64,${pixPayload.qrCodeBase64}`}
                  alt="QR Code Pix ATLLY"
                />
              </div>
              <label className="native-checkout__field native-checkout__copy-field">
                <span className="native-checkout__label">Código Pix copia e cola</span>
                <div className="native-checkout__copy-row">
                  <input className="native-checkout__input" readOnly value={pixPayload.copyPaste} aria-label="Código Pix" />
                  <button type="button" className="native-checkout__copy-btn" onClick={() => void handleCopyPix()}>
                    {copyState === "copied" ? <Check size={16} /> : <Copy size={16} />}
                    {copyState === "copied" ? "Copiado" : "Copiar"}
                  </button>
                </div>
              </label>
              {pixPayload.expiresAt ? (
                <p className="native-checkout__hint">Expira em {new Date(pixPayload.expiresAt).toLocaleString("pt-BR")}</p>
              ) : null}
              <div className="native-checkout__waiting">
                {pixConfirmed ? <Check size={18} /> : pixVerifying ? <Loader2 className="spin" size={18} /> : <Loader2 className="spin" size={18} />}
                <span>
                  {pixConfirmed
                    ? "Pagamento confirmado. Liberando seu acesso…"
                    : pixVerifying
                      ? "Consultando confirmação no Asaas…"
                      : "Aguardando confirmação do Pix…"}
                </span>
              </div>
              {!pixConfirmed ? (
                <button
                  type="button"
                  className="native-checkout__verify-btn"
                  onClick={() => void pollPixPaymentStatus({ manual: true })}
                  disabled={pixVerifying}
                >
                  {pixVerifying ? "Verificando…" : "Já paguei — verificar agora"}
                </button>
              ) : null}
            </>
          )}
        </div>
      ) : !cardReady ? (
        <div className="native-checkout__panel native-checkout__panel--card">
          <div className="native-checkout__empty">
            <strong>Pague com cartão de crédito</strong>
            <p>Na próxima etapa, preencha os dados do cartão com segurança.</p>
            {isAnnualPlan ? (
              <p className="native-checkout__hint">Plano anual: parcelamento em até 12× no cartão de crédito.</p>
            ) : (
              <p className="native-checkout__hint">Débito não está disponível nesta tela. Use Pix para pagamento imediato.</p>
            )}
            <button
              type="button"
              className="ui-btn-primary activate-funnel-cta native-checkout__empty-cta native-checkout__cta native-checkout__cta--card"
              onClick={handlePrepareCardCheckout}
              disabled={prepareCheckoutDisabled}
            >
              {loading ? <Loader2 className="spin" size={18} /> : <CreditCard size={18} />}
              Continuar com cartão de crédito
            </button>
          </div>
        </div>
      ) : (
        <form className="native-checkout__panel native-checkout__card-form" onSubmit={(event) => void handleSubmitCard(event)}>
          <div className="native-checkout__form-head">
            <div>
              <strong>Cartão de crédito</strong>
              <p>Preencha as informações do titular para concluir.</p>
            </div>
          </div>
          <p className="native-checkout__hint native-checkout__full">
            {isAnnualPlan
              ? "Escolha à vista ou parcele em até 12× no cartão de crédito. Débito não está disponível nesta tela."
              : "Pagamento à vista no cartão de crédito. Débito não está disponível nesta tela."}
          </p>

          {isAnnualPlan ? (
            <div className="native-checkout__section">
              <span className="native-checkout__section-title">Parcelamento</span>
              <label className="native-checkout__field native-checkout__full">
                <span className="native-checkout__label">Como deseja pagar?</span>
                <select
                  className="native-checkout__input native-checkout__select"
                  value={installmentCount}
                  onChange={(event) => setInstallmentCount(Number(event.target.value))}
                >
                  {installmentOptions.map((count) => (
                    <option key={count} value={count}>
                      {formatCardInstallmentLabel(count, amountInCents)}
                    </option>
                  ))}
                </select>
                <span className="native-checkout__hint">Cobrança única do plano anual, parcelada na fatura do cartão.</span>
              </label>
            </div>
          ) : null}

          <div className="native-checkout__brands-panel">
            <span className="native-checkout__section-title">Bandeiras aceitas</span>
            <CardBrandsImage className="native-checkout__brands-strip" />
          </div>

          <div className="native-checkout__section">
            <span className="native-checkout__section-title">Cartão</span>
            <div className="native-checkout__grid">
              <label className="native-checkout__field native-checkout__full">
                <span className="native-checkout__label">Nome impresso no cartão</span>
                <input
                  className="native-checkout__input"
                  value={cardForm.holderName}
                  onChange={(event) => setCardForm((current) => ({ ...current, holderName: event.target.value.toUpperCase() }))}
                  placeholder="Como aparece no cartão"
                  autoComplete="cc-name"
                  required
                />
              </label>
              <label className="native-checkout__field native-checkout__full">
                <span className="native-checkout__label">Número do cartão</span>
                <input
                  className="native-checkout__input native-checkout__input--card"
                  value={cardForm.number}
                  onChange={(event) => setCardForm((current) => ({ ...current, number: formatCardNumber(event.target.value) }))}
                  placeholder="0000 0000 0000 0000"
                  inputMode="numeric"
                  autoComplete="cc-number"
                  required
                />
              </label>
              <label className="native-checkout__field">
                <span className="native-checkout__label">Mês</span>
                <input
                  className="native-checkout__input"
                  value={cardForm.expiryMonth}
                  onChange={(event) => setCardForm((current) => ({ ...current, expiryMonth: onlyDigits(event.target.value).slice(0, 2) }))}
                  placeholder="MM"
                  inputMode="numeric"
                  autoComplete="cc-exp-month"
                  required
                />
              </label>
              <label className="native-checkout__field">
                <span className="native-checkout__label">Ano</span>
                <input
                  className="native-checkout__input"
                  value={cardForm.expiryYear}
                  onChange={(event) => setCardForm((current) => ({ ...current, expiryYear: onlyDigits(event.target.value).slice(0, 4) }))}
                  placeholder="AAAA"
                  inputMode="numeric"
                  autoComplete="cc-exp-year"
                  required
                />
              </label>
              <label className="native-checkout__field">
                <span className="native-checkout__label">CVV</span>
                <input
                  className="native-checkout__input"
                  value={cardForm.ccv}
                  onChange={(event) => setCardForm((current) => ({ ...current, ccv: onlyDigits(event.target.value).slice(0, 4) }))}
                  placeholder="123"
                  inputMode="numeric"
                  autoComplete="cc-csc"
                  required
                />
              </label>
            </div>
          </div>

          <div className="native-checkout__section">
            <span className="native-checkout__section-title">Titular</span>
            <div className="native-checkout__grid">
              <label className="native-checkout__field">
                <span className="native-checkout__label">CPF</span>
                <input
                  className="native-checkout__input"
                  value={cardForm.holderCpfCnpj}
                  onChange={(event) => setCardForm((current) => ({ ...current, holderCpfCnpj: formatCpf(event.target.value) }))}
                  placeholder="000.000.000-00"
                  inputMode="numeric"
                  required
                />
              </label>
              <label className="native-checkout__field">
                <span className="native-checkout__label">Telefone</span>
                <input
                  className="native-checkout__input"
                  value={cardForm.holderPhone}
                  onChange={(event) => setCardForm((current) => ({ ...current, holderPhone: formatPhone(event.target.value) }))}
                  placeholder="(00) 00000-0000"
                  inputMode="tel"
                  required
                />
              </label>
              <label className="native-checkout__field native-checkout__full">
                <span className="native-checkout__label">E-mail</span>
                <input
                  className="native-checkout__input"
                  type="email"
                  value={cardForm.holderEmail}
                  onChange={(event) => setCardForm((current) => ({ ...current, holderEmail: event.target.value }))}
                  placeholder="seu@email.com"
                  autoComplete="email"
                  required
                />
              </label>
              <label className="native-checkout__field">
                <span className="native-checkout__label">CEP</span>
                <input
                  className="native-checkout__input"
                  value={cardForm.holderPostalCode}
                  onChange={(event) => setCardForm((current) => ({ ...current, holderPostalCode: formatCep(event.target.value) }))}
                  placeholder="00000-000"
                  inputMode="numeric"
                  required
                />
              </label>
              <label className="native-checkout__field">
                <span className="native-checkout__label">Número</span>
                <input
                  className="native-checkout__input"
                  value={cardForm.holderAddressNumber}
                  onChange={(event) => setCardForm((current) => ({ ...current, holderAddressNumber: event.target.value }))}
                  placeholder="123"
                  required
                />
              </label>
            </div>
          </div>

          <button type="submit" className="ui-btn-primary activate-funnel-cta native-checkout__submit" disabled={loading || cardSubmitting}>
            {cardSubmitting || loading ? <Loader2 className="spin" size={18} /> : <ShieldCheck size={18} />}
            {cardPayLabel}
          </button>
        </form>
      )}

      <TrustBadgesImage className="native-checkout__trust-badges" />
    </div>
  );
}
