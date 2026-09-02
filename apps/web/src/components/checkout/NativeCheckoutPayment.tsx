import { Check, Copy, CreditCard, Loader2, QrCode, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { formatPriceInBRL } from "@app-treino/shared";
import { apiGet, apiPost } from "../../api";
import type { CheckoutSessionResponse, NativeCheckoutPayload, PaymentRow } from "../../types/shared";
import { brand } from "../../lib/brand";

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
  onError
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

  return (
    <div className="native-checkout">
      <div className="native-checkout__summary">
        <span className="home-telemetry-label">{brand.name} Checkout</span>
        <strong>{summaryLine}</strong>
        <p>Pagamento seguro sem sair do {brand.name}.</p>
      </div>

      <div className="native-checkout__tabs" role="tablist" aria-label="Forma de pagamento">
        <button
          type="button"
          role="tab"
          aria-selected={billingType === "PIX"}
          className={billingType === "PIX" ? "is-active" : ""}
          onClick={() => onBillingTypeChange("PIX")}
        >
          <QrCode size={16} />
          Pix
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={billingType === "CREDIT_CARD"}
          className={billingType === "CREDIT_CARD" ? "is-active" : ""}
          onClick={() => onBillingTypeChange("CREDIT_CARD")}
        >
          <CreditCard size={16} />
          Cartão
        </button>
      </div>

      {error ? <div className="activate-funnel-error">{error}</div> : null}

      {billingType === "PIX" ? (
        <div className="native-checkout__panel">
          {!pixPayload ? (
            <div className="native-checkout__empty">
              <p>Use o botão abaixo para gerar o QR Code Pix.</p>
            </div>
          ) : (
            <>
              <div className="native-checkout__qr-wrap">
                <img
                  className="native-checkout__qr"
                  src={`data:image/png;base64,${pixPayload.qrCodeBase64}`}
                  alt="QR Code Pix ATLLY"
                />
              </div>
              <label className="native-checkout__copy-field">
                <span>Código Pix copia e cola</span>
                <div className="native-checkout__copy-row">
                  <input readOnly value={pixPayload.copyPaste} aria-label="Código Pix" />
                  <button type="button" className="ui-btn-secondary" onClick={() => void handleCopyPix()}>
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
      ) : (
        <form className="native-checkout__panel native-checkout__card-form" onSubmit={(event) => void handleSubmitCard(event)}>
          <div className="native-checkout__grid">
            <label>
              <span>Nome no cartão</span>
              <input
                value={cardForm.holderName}
                onChange={(event) => setCardForm((current) => ({ ...current, holderName: event.target.value }))}
                autoComplete="cc-name"
                required
              />
            </label>
            <label className="native-checkout__full">
              <span>Número do cartão</span>
              <input
                value={cardForm.number}
                onChange={(event) => setCardForm((current) => ({ ...current, number: event.target.value }))}
                inputMode="numeric"
                autoComplete="cc-number"
                required
              />
            </label>
            <label>
              <span>Mês</span>
              <input
                value={cardForm.expiryMonth}
                onChange={(event) => setCardForm((current) => ({ ...current, expiryMonth: event.target.value }))}
                placeholder="MM"
                inputMode="numeric"
                autoComplete="cc-exp-month"
                required
              />
            </label>
            <label>
              <span>Ano</span>
              <input
                value={cardForm.expiryYear}
                onChange={(event) => setCardForm((current) => ({ ...current, expiryYear: event.target.value }))}
                placeholder="AAAA"
                inputMode="numeric"
                autoComplete="cc-exp-year"
                required
              />
            </label>
            <label>
              <span>CVV</span>
              <input
                value={cardForm.ccv}
                onChange={(event) => setCardForm((current) => ({ ...current, ccv: event.target.value }))}
                inputMode="numeric"
                autoComplete="cc-csc"
                required
              />
            </label>
            <label>
              <span>CPF do titular</span>
              <input
                value={cardForm.holderCpfCnpj}
                onChange={(event) => setCardForm((current) => ({ ...current, holderCpfCnpj: event.target.value }))}
                inputMode="numeric"
                required
              />
            </label>
            <label>
              <span>E-mail</span>
              <input
                type="email"
                value={cardForm.holderEmail}
                onChange={(event) => setCardForm((current) => ({ ...current, holderEmail: event.target.value }))}
                autoComplete="email"
                required
              />
            </label>
            <label>
              <span>Telefone</span>
              <input
                value={cardForm.holderPhone}
                onChange={(event) => setCardForm((current) => ({ ...current, holderPhone: event.target.value }))}
                inputMode="tel"
                required
              />
            </label>
            <label>
              <span>CEP</span>
              <input
                value={cardForm.holderPostalCode}
                onChange={(event) => setCardForm((current) => ({ ...current, holderPostalCode: event.target.value }))}
                inputMode="numeric"
                required
              />
            </label>
            <label>
              <span>Número</span>
              <input
                value={cardForm.holderAddressNumber}
                onChange={(event) => setCardForm((current) => ({ ...current, holderAddressNumber: event.target.value }))}
                required
              />
            </label>
          </div>

          <button type="submit" className="ui-btn-primary activate-funnel-cta" disabled={loading || cardSubmitting || !payment?.id}>
            {cardSubmitting || loading ? <Loader2 className="spin" size={18} /> : <ShieldCheck size={18} />}
            Pagar com cartão
          </button>
        </form>
      )}
    </div>
  );
}
