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

export function vitrineCheckoutCallbacks(input: { orderId?: string; purchaseId?: string }) {
  const webOrigin =
    env.ASAAS_CALLBACK_URL?.split(",")[0]?.trim() ?? env.WEB_ORIGIN.split(",")[0]?.trim() ?? env.WEB_ORIGIN;
  const isHttps = webOrigin.startsWith("https://");
  const callbackBase = isHttps ? webOrigin : "https://example.com";

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
  const callbackBase = isHttps ? webOrigin : "https://example.com";
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
  if (raw.includes("invalid_access_token")) {
    return "Chave Asaas inválida. Atualize ASAAS_API_KEY no .env ou use a confirmação sandbox (dev).";
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
