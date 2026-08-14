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

export async function createAsaasCheckout(input: {
  externalReference: string;
  itemName: string;
  itemDescription: string;
  amountInCents: number;
  billingType: AsaasBillingType;
}) {
  if (!env.ASAAS_API_KEY) {
    return null;
  }

  const webOrigin =
    env.ASAAS_CALLBACK_URL?.split(",")[0]?.trim() ?? env.WEB_ORIGIN.split(",")[0]?.trim() ?? env.WEB_ORIGIN;
  const isHttps = webOrigin.startsWith("https://");
  const callbackBase = isHttps ? webOrigin : "https://example.com";
  const callback = {
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
