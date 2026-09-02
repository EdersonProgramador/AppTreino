import type { Membership, Payment, Plan, Profile } from "@prisma/client";
import { env } from "../env.js";
import { prisma } from "../prisma.js";
import {
  createAsaasCustomer,
  findAsaasCustomerByExternalReference,
  tryFetchAsaasPixQrCode,
  tryPayAsaasCreditCard,
  tryPrepareAsaasPixPayment,
  type AsaasCreditCardHolderInput,
  type AsaasCreditCardInput
} from "./asaas.client.js";
import { asaasStatusToPaymentStatus } from "./asaas.routes.js";
import {
  asaasCheckoutItemDescription,
  asaasCheckoutItemName,
  resolveNativeCheckoutBillingType
} from "./checkout.utils.js";

export type NativeCheckoutPixPayload = {
  qrCodeBase64: string;
  copyPaste: string;
  expiresAt: string | null;
};

export type NativeCheckoutPayload = {
  billingType: "PIX" | "CREDIT_CARD";
  pix?: NativeCheckoutPixPayload;
};

type CheckoutUser = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  asaasCustomerId?: string | null;
  profile?: Profile | null;
};
type CheckoutMembership = Membership & { plan?: Plan | null };

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

export async function ensureAsaasCustomerForUser(user: CheckoutUser) {
  if (user.asaasCustomerId) return user.asaasCustomerId;
  if (!env.ASAAS_API_KEY) return null;

  const existing = await findAsaasCustomerByExternalReference(user.id);
  if (existing?.id) {
    await prisma.user.update({
      where: { id: user.id },
      data: { asaasCustomerId: existing.id }
    });
    return existing.id;
  }

  const created = await createAsaasCustomer({
    name: user.name,
    email: user.email,
    phone: user.profile?.phone ?? user.phone,
    cpfCnpj: user.profile?.document,
    externalReference: user.id
  });

  await prisma.user.update({
    where: { id: user.id },
    data: { asaasCustomerId: created.id }
  });

  return created.id;
}

function paymentDescription(membership: CheckoutMembership, planName: string) {
  return asaasCheckoutItemDescription(planName);
}

function canReuseNativePixCharge(payment: Payment) {
  return Boolean(payment.asaasPaymentId) && ["PENDING", "OVERDUE"].includes(payment.status);
}

export async function prepareNativeSubscriptionCheckout(input: {
  payment: Payment;
  membership: CheckoutMembership;
  user: CheckoutUser;
  planName: string;
  billingType: "BOLETO" | "CREDIT_CARD" | "PIX" | "UNDEFINED";
}) {
  const resolvedBillingType = resolveNativeCheckoutBillingType(input.billingType);

  if (resolvedBillingType === "CREDIT_CARD") {
    return {
      payment: input.payment,
      nativeCheckout: {
        billingType: "CREDIT_CARD" as const
      },
      providerError: undefined as string | undefined
    };
  }

  const customerId = await ensureAsaasCustomerForUser(input.user);
  if (!customerId) {
    return {
      payment: input.payment,
      nativeCheckout: null,
      providerError: "Pagamento online indisponível no momento. Tente novamente em instantes."
    };
  }

  const description = paymentDescription(input.membership, input.planName);

  if (canReuseNativePixCharge(input.payment)) {
    const { pix, providerError } = await tryFetchAsaasPixQrCode(input.payment.asaasPaymentId as string);
    if (pix) {
      return {
        payment: input.payment,
        nativeCheckout: {
          billingType: "PIX" as const,
          pix: {
            qrCodeBase64: pix.encodedImage,
            copyPaste: pix.payload,
            expiresAt: pix.expirationDate ?? null
          }
        },
        providerError: providerError ?? undefined
      };
    }
  }

  const { payment: asaasPayment, pix, providerError } = await tryPrepareAsaasPixPayment({
    customerId,
    amountInCents: input.payment.amountInCents,
    dueDate: input.payment.dueDate,
    externalReference: input.payment.id,
    description
  });

  if (!asaasPayment || !pix) {
    return {
      payment: input.payment,
      nativeCheckout: null,
      providerError: providerError ?? "Não foi possível gerar o Pix."
    };
  }

  const updatedPayment = await prisma.payment.update({
    where: { id: input.payment.id },
    data: {
      asaasPaymentId: asaasPayment.id,
      paymentUrl: null,
      status: asaasStatusToPaymentStatus(asaasPayment.status)
    }
  });

  return {
    payment: updatedPayment,
    nativeCheckout: {
      billingType: "PIX" as const,
      pix: {
        qrCodeBase64: pix.encodedImage,
        copyPaste: pix.payload,
        expiresAt: pix.expirationDate ?? null
      }
    },
    providerError: providerError ?? undefined
  };
}

export async function payNativeSubscriptionWithCard(input: {
  payment: Payment;
  membership: CheckoutMembership;
  user: CheckoutUser;
  planName: string;
  creditCard: AsaasCreditCardInput;
  creditCardHolderInfo: AsaasCreditCardHolderInput;
  remoteIp: string;
}) {
  const customerId = await ensureAsaasCustomerForUser(input.user);
  if (!customerId) {
    return {
      payment: input.payment,
      providerError: "Pagamento online indisponível no momento. Tente novamente em instantes."
    };
  }

  const description = paymentDescription(input.membership, input.planName);
  const { payment: asaasPayment, providerError } = await tryPayAsaasCreditCard({
    customerId,
    amountInCents: input.payment.amountInCents,
    dueDate: input.payment.dueDate,
    externalReference: input.payment.id,
    description,
    creditCard: {
      ...input.creditCard,
      number: onlyDigits(input.creditCard.number)
    },
    creditCardHolderInfo: {
      ...input.creditCardHolderInfo,
      cpfCnpj: onlyDigits(input.creditCardHolderInfo.cpfCnpj),
      postalCode: onlyDigits(input.creditCardHolderInfo.postalCode),
      phone: onlyDigits(input.creditCardHolderInfo.phone)
    },
    remoteIp: input.remoteIp
  });

  if (!asaasPayment) {
    return {
      payment: input.payment,
      providerError: providerError ?? "Não foi possível processar o cartão."
    };
  }

  const updatedPayment = await prisma.payment.update({
    where: { id: input.payment.id },
    data: {
      asaasPaymentId: asaasPayment.id,
      paymentUrl: null,
      status: asaasStatusToPaymentStatus(asaasPayment.status),
      paidAt: asaasStatusToPaymentStatus(asaasPayment.status) === "CONFIRMED" ? new Date() : null
    }
  });

  return {
    payment: updatedPayment,
    providerError: providerError ?? undefined
  };
}

export function buildNativeCheckoutResponse(input: {
  membership: CheckoutMembership;
  payment: Payment;
  alreadyActive: boolean;
  nativeCheckout?: NativeCheckoutPayload | null;
  paymentProviderError?: string;
}) {
  return {
    membership: input.membership,
    payment: input.payment,
    alreadyActive: input.alreadyActive,
    nativeCheckout: input.nativeCheckout ?? undefined,
    paymentProviderError: input.paymentProviderError
  };
}

export function subscriptionLineItemName(planName: string) {
  return asaasCheckoutItemName(planName);
}
