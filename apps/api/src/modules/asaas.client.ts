import { env } from "../env.js";

export type AsaasBillingType = "BOLETO" | "CREDIT_CARD" | "PIX" | "UNDEFINED";

export const PURCHASE_EXTERNAL_REF_PREFIX = "purchase:";
export const ORDER_EXTERNAL_REF_PREFIX = "order:";

export function purchaseExternalReference(purchaseId: string) {
  return `${PURCHASE_EXTERNAL_REF_PREFIX}${purchaseId}`;
}

export function parsePurchaseExternalReference(reference: string | null | undefined) {
  if (!reference?.startsWith(PURCHASE_EXTERNAL_REF_PREFIX)) return null;
  return reference.slice(PURCHASE_EXTERNAL_REF_PREFIX.length);
}

export function orderExternalReference(orderId: string) {
  return `${ORDER_EXTERNAL_REF_PREFIX}${orderId}`;
}

export function parseOrderExternalReference(reference: string | null | undefined) {
  if (!reference?.startsWith(ORDER_EXTERNAL_REF_PREFIX)) return null;
  return reference.slice(ORDER_EXTERNAL_REF_PREFIX.length);
}

export function asaasBillingTypes(billingType: AsaasBillingType) {
  if (billingType === "PIX") return ["PIX"] as const;
  if (billingType === "CREDIT_CARD") return ["CREDIT_CARD"] as const;
  return ["PIX", "CREDIT_CARD"] as const;
}

function resolveCallbackBase() {
  const webOrigin =
    env.ASAAS_CALLBACK_URL?.split(",")[0]?.trim() ?? env.WEB_ORIGIN.split(",")[0]?.trim() ?? env.WEB_ORIGIN;
  return webOrigin.startsWith("https://") ? webOrigin.replace(/\/$/, "") : "https://www.atlly.com.br";
}

export function subscriptionCheckoutCallbacks() {
  const studentUrl = `${resolveCallbackBase()}/aluno`;
  return {
    successUrl: `${studentUrl}?payment=success`,
    cancelUrl: `${studentUrl}?payment=cancel`,
    expiredUrl: `${studentUrl}?payment=expired`
  };
}

export function vitrineCheckoutCallbacks(input: { orderId?: string; purchaseId?: string }) {
  const callbackBase = resolveCallbackBase();

  const successParams = new URLSearchParams();
  successParams.set("section", "products");
  successParams.set("storeTab", "orders");
  successParams.set("payment", "success");
  if (input.orderId) successParams.set("orderId", input.orderId);
  if (input.purchaseId) successParams.set("purchaseId", input.purchaseId);

  const cancelParams = new URLSearchParams();
  cancelParams.set("section", "products");
  cancelParams.set("storeTab", "orders");
  cancelParams.set("payment", "cancel");

  return {
    successUrl: `${callbackBase}/?${successParams.toString()}`,
    cancelUrl: `${callbackBase}/?${cancelParams.toString()}`,
    expiredUrl: `${callbackBase}/?${cancelParams.toString()}`
  };
}

export async function createAsaasCheckout(input: {
  externalReference: string;
  itemName: string;
  itemDescription: string;
  amountInCents: number;
  billingType: AsaasBillingType;
  callbacks?: {
    successUrl: string;
    cancelUrl: string;
    expiredUrl: string;
  };
}) {
  if (!env.ASAAS_API_KEY) {
    return null;
  }

  const webOrigin =
    env.ASAAS_CALLBACK_URL?.split(",")[0]?.trim() ?? env.WEB_ORIGIN.split(",")[0]?.trim() ?? env.WEB_ORIGIN;
  const isHttps = webOrigin.startsWith("https://");
  const callbackBase = isHttps ? webOrigin.replace(/\/$/, "") : resolveCallbackBase();
  const callback = input.callbacks ?? {
    successUrl: `${callbackBase}/`,
    cancelUrl: `${callbackBase}/`,
    expiredUrl: `${callbackBase}/`
  };

  const response = await fetch(`${env.ASAAS_API_URL}/checkouts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      access_token: env.ASAAS_API_KEY
    },
    signal: AbortSignal.timeout(10000),
    body: JSON.stringify({
      billingTypes: asaasBillingTypes(input.billingType),
      chargeTypes: ["DETACHED"],
      minutesToExpire: 120,
      externalReference: input.externalReference,
      callback,
      items: [
        {
          externalReference: input.externalReference,
          name: input.itemName,
          description: input.itemDescription,
          quantity: 1,
          value: input.amountInCents / 100
        }
      ]
    })
  });

  if (!response.ok) {
    const message = await response.text();
    console.error("[Asaas Checkout] Erro ao criar checkout:", message);
    throw new Error(`Falha ao criar checkout no Asaas: ${message}`);
  }

  const data = (await response.json()) as {
    id?: string;
    link?: string;
    status?: string;
  };

  return {
    id: data.id,
    url: data.link,
    status: data.status
  };
}

export function humanizeAsaasCheckoutError(raw: string) {
  const normalized = raw.toLowerCase();

  if (normalized.includes("invalid_access_token")) {
    return "Chave Asaas inválida ou ambiente incorreto (sandbox vs produção). Verifique ASAAS_API_KEY e ASAAS_API_URL no Render.";
  }

  if (normalized.includes("chave pix") || normalized.includes("pix key") || normalized.includes("chave de pix")) {
    return "Conta Asaas sem chave Pix cadastrada. Cadastre em Configurações → Pix no painel Asaas.";
  }

  try {
    const jsonStart = raw.indexOf("{");
    if (jsonStart >= 0) {
      const parsed = JSON.parse(raw.slice(jsonStart)) as {
        errors?: Array<{ code?: string; description?: string }>;
      };
      const first = parsed.errors?.[0];
      if (first?.description) {
        return `Asaas: ${first.description}`;
      }
    }
  } catch {
    // ignore JSON parse errors
  }

  return "Pagamento online indisponível no momento. Tente novamente em instantes.";
}

/** Não propaga falha do Asaas — usado após persistir membership/pagamento. */
export async function tryCreateAsaasCheckout(input: Parameters<typeof createAsaasCheckout>[0]) {
  try {
    const checkout = await createAsaasCheckout(input);
    return { checkout, providerError: null as string | null };
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    console.error("[Asaas Checkout] Falha não fatal:", raw);
    return { checkout: null, providerError: humanizeAsaasCheckoutError(raw) };
  }
}

function asaasHeaders() {
  if (!env.ASAAS_API_KEY) {
    throw new Error("ASAAS_API_KEY não configurada.");
  }
  return {
    "Content-Type": "application/json",
    access_token: env.ASAAS_API_KEY
  };
}

async function asaasJsonRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${env.ASAAS_API_URL}${path}`, {
    ...init,
    headers: {
      ...asaasHeaders(),
      ...(init?.headers ?? {})
    },
    signal: AbortSignal.timeout(15000)
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Falha na requisição Asaas (${response.status}).`);
  }

  return (await response.json()) as T;
}

const ASAAS_TIMEZONE = "America/Sao_Paulo";

export function formatAsaasDate(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ASAAS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

export function todayAsaasDueDateString() {
  return formatAsaasDate(new Date());
}

/** Asaas rejeita vencimento anterior a "hoje" (fuso BR). */
export function resolveAsaasDueDate(stored?: Date | null) {
  const today = todayAsaasDueDateString();
  if (!stored) return today;
  const storedDay = formatAsaasDate(stored);
  return storedDay < today ? today : storedDay;
}

export function parseAsaasDueDate(dateStr: string) {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export type AsaasCustomerRecord = {
  id: string;
  name?: string;
  email?: string;
};

export async function findAsaasCustomerByExternalReference(externalReference: string) {
  if (!env.ASAAS_API_KEY) return null;
  const data = await asaasJsonRequest<{ data?: AsaasCustomerRecord[] }>(
    `/customers?externalReference=${encodeURIComponent(externalReference)}&limit=1`
  );
  return data.data?.[0] ?? null;
}

export async function createAsaasCustomer(input: {
  name: string;
  email?: string | null;
  phone?: string | null;
  cpfCnpj?: string | null;
  externalReference: string;
}) {
  return asaasJsonRequest<AsaasCustomerRecord>("/customers", {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      email: input.email ?? undefined,
      mobilePhone: input.phone ?? undefined,
      cpfCnpj: input.cpfCnpj?.replace(/\D/g, "") || undefined,
      externalReference: input.externalReference,
      notificationDisabled: true
    })
  });
}

export type AsaasPaymentRecord = {
  id: string;
  status?: string;
  invoiceUrl?: string | null;
  bankSlipUrl?: string | null;
};

export async function createAsaasPayment(input: {
  customerId: string;
  billingType: "PIX" | "CREDIT_CARD";
  amountInCents: number;
  dueDate: Date;
  externalReference: string;
  description: string;
}) {
  return asaasJsonRequest<AsaasPaymentRecord>("/payments", {
    method: "POST",
    body: JSON.stringify({
      customer: input.customerId,
      billingType: input.billingType,
      value: input.amountInCents / 100,
      dueDate: resolveAsaasDueDate(input.dueDate),
      externalReference: input.externalReference,
      description: input.description
    })
  });
}

export async function getAsaasPayment(asaasPaymentId: string) {
  return asaasJsonRequest<AsaasPaymentRecord>(`/payments/${asaasPaymentId}`);
}

export type AsaasPixQrCode = {
  encodedImage: string;
  payload: string;
  expirationDate?: string | null;
};

export async function getAsaasPixQrCode(asaasPaymentId: string) {
  return asaasJsonRequest<AsaasPixQrCode>(`/payments/${asaasPaymentId}/pixQrCode`);
}

export type AsaasCreditCardInput = {
  holderName: string;
  number: string;
  expiryMonth: string;
  expiryYear: string;
  ccv: string;
};

export type AsaasCreditCardHolderInput = {
  name: string;
  email: string;
  cpfCnpj: string;
  postalCode: string;
  addressNumber: string;
  phone: string;
};

export async function createAsaasCreditCardPayment(input: {
  customerId: string;
  amountInCents: number;
  dueDate: Date;
  externalReference: string;
  description: string;
  creditCard: AsaasCreditCardInput;
  creditCardHolderInfo: AsaasCreditCardHolderInput;
  remoteIp: string;
}) {
  return asaasJsonRequest<AsaasPaymentRecord & { creditCardToken?: string | null }>("/payments", {
    method: "POST",
    body: JSON.stringify({
      customer: input.customerId,
      billingType: "CREDIT_CARD",
      value: input.amountInCents / 100,
      dueDate: resolveAsaasDueDate(input.dueDate),
      externalReference: input.externalReference,
      description: input.description,
      remoteIp: input.remoteIp,
      creditCard: input.creditCard,
      creditCardHolderInfo: input.creditCardHolderInfo
    })
  });
}

export async function tryPrepareAsaasPixPayment(
  input: Omit<Parameters<typeof createAsaasPayment>[0], "billingType">
) {
  try {
    const payment = await createAsaasPayment({ ...input, billingType: "PIX" });
    const pix = await getAsaasPixQrCode(payment.id);
    return { payment, pix, providerError: null as string | null };
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    console.error("[Asaas Pix] Falha não fatal:", raw);
    return { payment: null, pix: null, providerError: humanizeAsaasCheckoutError(raw) };
  }
}

export async function tryPayAsaasCreditCard(input: Parameters<typeof createAsaasCreditCardPayment>[0]) {
  try {
    const payment = await createAsaasCreditCardPayment(input);
    return { payment, providerError: null as string | null };
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    console.error("[Asaas Cartão] Falha não fatal:", raw);
    return { payment: null, providerError: humanizeAsaasCheckoutError(raw) };
  }
}

export async function tryFetchAsaasPixQrCode(asaasPaymentId: string) {
  try {
    const pix = await getAsaasPixQrCode(asaasPaymentId);
    return { pix, providerError: null as string | null };
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    console.error("[Asaas Pix QR] Falha não fatal:", raw);
    return { pix: null, providerError: humanizeAsaasCheckoutError(raw) };
  }
}
