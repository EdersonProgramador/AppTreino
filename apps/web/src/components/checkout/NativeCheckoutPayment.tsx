import { Check, Copy, CreditCard, Loader2, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { formatPriceInBRL } from "@app-treino/shared";
import { apiGet, apiPost } from "../../api";
import type { CheckoutSessionResponse, NativeCheckoutPayload, PaymentRow } from "../../types/shared";
import { brand } from "../../lib/brand";
import { CardBrandsImage, CardMethodPreview, PixBrandImage, TrustBadgesImage } from "./PaymentMethodArt";

export type NativeBillingType = "PIX" | "CREDIT_CARD";

type NativeCheckoutPaymentProps = {
  token: string;
  planName: string;
  amountInCents: number;
  payment: PaymentRow | null;
  nativeCheckout: NativeCheckoutPayload | null;
  billingType: NativeBillingType;
  onBillingTypeChange: (value: NativeBillingType) => void;
  loading?: boolean;
  error?: string | null;
  defaultEmail?: string | null;
  defaultPhone?: string | null;
  defaultName?: string | null;
  onSessionResponse: (response: CheckoutSessionResponse) => void;
  onPaymentConfirmed: () => void;
  onError: (message: string) => void;
  onPrepareCheckout?: () => void;
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

function formatCpf(value: string) {
  const digits = onlyDigits(value).slice(0, 11);
  return digits
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
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
  payment,
  nativeCheckout,
  billingType,
  onBillingTypeChange,
  loading = false,
  error,
  defaultEmail,
  defaultPhone,
  defaultName,
  onSessionResponse,
  onPaymentConfirmed,
  onError,
  onPrepareCheckout,
  prepareDisabled = false
}: NativeCheckoutPaymentProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const [cardSubmitting, setCardSubmitting] = useState(false);
  const [cardForm, setCardForm] = useState<CardFormState>({
    holderName: defaultName ?? "",
    number: "",
    expiryMonth: "",
    expiryYear: "",
    ccv: "",
    holderEmail: defaultEmail ?? "",
    holderCpfCnpj: "",
    holderPostalCode: "",
    holderAddressNumber: "",
    holderPhone: defaultPhone ?? ""
  });

  const pixPayload = nativeCheckout?.billingType === "PIX" ? nativeCheckout.pix : null;
  const waitingPix = Boolean(payment?.id && pixPayload && payment.status === "PENDING");

  useEffect(() => {
    if (!payment?.id || !waitingPix) return;

    let cancelled = false;
    const interval = window.setInterval(async () => {
      try {
        const response = await apiGet<{
          payment: PaymentRow;
          alreadyActive: boolean;
        }>(`/checkout/payments/${payment.id}/status`, token);
        if (cancelled) return;
        if (response.alreadyActive || response.payment?.status === "CONFIRMED") {
          onPaymentConfirmed();
        }
      } catch {
        // polling silencioso
      }
    }, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [payment?.id, payment?.status, waitingPix, token, onPaymentConfirmed]);

  const summaryLine = useMemo(
    () => `${planName} · ${formatPriceInBRL(amountInCents)}`,
    [amountInCents, planName]
  );

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
          holderPhone: onlyDigits(cardForm.holderPhone)
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

  return (
    <div className="native-checkout">
      <div className="native-checkout__summary">
        <span className="native-checkout__eyebrow">{brand.name} Checkout</span>
        <strong>{summaryLine}</strong>
        <p>Pagamento seguro sem sair do {brand.name}.</p>
      </div>

      <div className="native-checkout__methods" role="tablist" aria-label="Forma de pagamento">
        <button
          type="button"
          role="tab"
          aria-selected={billingType === "PIX"}
          className={`native-checkout__method native-checkout__method--pix${billingType === "PIX" ? " is-active" : ""}`}
          onClick={() => onBillingTypeChange("PIX")}
        >
          <PixBrandImage className="native-checkout__method-logo native-checkout__method-logo--pix" />
          <span className="native-checkout__method-copy">
            <strong>Pix</strong>
            <small>Aprovação imediata</small>
          </span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={billingType === "CREDIT_CARD"}
          className={`native-checkout__method native-checkout__method--card${billingType === "CREDIT_CARD" ? " is-active" : ""}`}
          onClick={() => onBillingTypeChange("CREDIT_CARD")}
        >
          <CardMethodPreview className="native-checkout__method-logo native-checkout__method-logo--card" />
          <span className="native-checkout__method-copy">
            <strong>Cartão</strong>
            <small>Crédito à vista</small>
          </span>
        </button>
      </div>

      {error ? <div className="activate-funnel-error">{error}</div> : null}

      {billingType === "PIX" ? (
        <div className="native-checkout__panel native-checkout__panel--pix">
          {!pixPayload ? (
            <div className="native-checkout__empty">
              <PixBrandImage className="native-checkout__hero-logo" />
              <strong>Pague com Pix</strong>
              <p>Gere o QR Code e conclua no app do seu banco.</p>
              <button
                type="button"
                className="ui-btn-primary activate-funnel-cta native-checkout__empty-cta native-checkout__cta native-checkout__cta--pix"
                onClick={onPrepareCheckout}
                disabled={prepareCheckoutDisabled}
              >
                {loading ? <Loader2 className="spin" size={18} /> : null}
                Gerar QR Code Pix
              </button>
            </div>
          ) : (
            <>
              <div className="native-checkout__qr-header">
                <PixBrandImage className="native-checkout__qr-logo" />
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
                <Loader2 className="spin" size={18} />
                <span>Aguardando confirmação do Pix…</span>
              </div>
            </>
          )}
        </div>
      ) : !cardReady ? (
        <div className="native-checkout__panel native-checkout__panel--card">
          <div className="native-checkout__empty">
            <CardBrandsImage className="native-checkout__hero-logo native-checkout__hero-logo--card" />
            <strong>Pague com cartão</strong>
            <p>Na próxima etapa, preencha os dados do cartão com segurança.</p>
            <button
              type="button"
              className="ui-btn-primary activate-funnel-cta native-checkout__empty-cta native-checkout__cta native-checkout__cta--card"
              onClick={onPrepareCheckout}
              disabled={prepareCheckoutDisabled}
            >
              {loading ? <Loader2 className="spin" size={18} /> : <CreditCard size={18} />}
              Continuar com cartão
            </button>
          </div>
        </div>
      ) : (
        <form className="native-checkout__panel native-checkout__card-form" onSubmit={(event) => void handleSubmitCard(event)}>
          <div className="native-checkout__form-head">
            <div>
              <strong>Dados do cartão</strong>
              <p>Preencha as informações do titular para concluir.</p>
            </div>
          </div>

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
            Pagar {formatPriceInBRL(amountInCents)} com cartão
          </button>
        </form>
      )}

      <TrustBadgesImage className="native-checkout__trust-badges" />
    </div>
  );
}
