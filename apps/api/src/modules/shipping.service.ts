import type { ProductKind, ShippingMethod } from "@prisma/client";
import { env } from "../env.js";
import { prisma } from "../prisma.js";

const DEFAULT_DELIVERY_FEE_CENTS = 1500;

export type ShippingProviderMode = "auto" | "flat" | "zones" | "melhor_envio";

export type ShippingAddressInput = {
  postalCode?: string | null;
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
};

export type ShippingProductInput = {
  productId: string;
  name: string;
  kind: ProductKind;
  quantity: number;
  priceInCents: number;
  allowsPickup: boolean;
  allowsDelivery: boolean;
  shippingFeeInCents?: number | null;
  weightGrams: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
};

export type ShippingServiceOption = {
  id: string;
  name: string;
  company: string;
  priceInCents: number;
  deliveryDays: number | null;
};

export type ItemShippingLine = {
  productId: string;
  productName: string;
  quantity: number;
  shippingMethod: ShippingMethod;
  shippingInCents: number;
  carrier?: string | null;
  serviceId?: string | null;
  serviceName?: string | null;
};

export type ShippingQuoteResult = {
  fulfillmentMethod: ShippingMethod;
  shippingInCents: number;
  shippingMethod: ShippingMethod;
  itemLines: ItemShippingLine[];
  services: ShippingServiceOption[];
  quoteSource: string;
  canPickup: boolean;
  canDeliver: boolean;
  formattedAddress?: string | null;
};

export function normalizePostalCode(value: string | null | undefined) {
  return String(value ?? "").replace(/\D/g, "").slice(0, 8);
}

export function isValidPostalCode(value: string | null | undefined) {
  return normalizePostalCode(value).length === 8;
}

export function formatShippingAddress(input: ShippingAddressInput) {
  const parts = [
    input.street,
    input.number ? `nº ${input.number}` : null,
    input.complement,
    input.neighborhood,
    input.city && input.state ? `${input.city}/${input.state}` : input.city ?? input.state,
    input.postalCode ? `CEP ${normalizePostalCode(input.postalCode)}` : null
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

export async function lookupPostalCode(postalCode: string) {
  const normalized = normalizePostalCode(postalCode);
  if (!isValidPostalCode(normalized)) {
    const error = new Error("CEP inválido.") as Error & { statusCode: number };
    error.statusCode = 400;
    throw error;
  }

  const response = await fetch(`https://viacep.com.br/ws/${normalized}/json/`, {
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) {
    const error = new Error("Não foi possível consultar o CEP.") as Error & { statusCode: number };
    error.statusCode = 502;
    throw error;
  }

  const data = (await response.json()) as {
    erro?: boolean;
    cep?: string;
    logradouro?: string;
    complemento?: string;
    bairro?: string;
    localidade?: string;
    uf?: string;
  };

  if (data.erro) {
    const error = new Error("CEP não encontrado.") as Error & { statusCode: number };
    error.statusCode = 404;
    throw error;
  }

  return {
    postalCode: normalizePostalCode(data.cep ?? normalized),
    street: data.logradouro ?? "",
    complement: data.complemento ?? "",
    neighborhood: data.bairro ?? "",
    city: data.localidade ?? "",
    state: data.uf ?? ""
  };
}

export async function getCommerceShippingSettings() {
  const keys = [
    "commerce_delivery_fee_cents",
    "commerce_origin_postal_code",
    "commerce_shipping_provider"
  ];
  const rows = await prisma.systemSetting.findMany({ where: { key: { in: keys } } });
  const map = Object.fromEntries(rows.map((row) => [row.key, row.value]));

  const deliveryFee = Number.parseInt(map.commerce_delivery_fee_cents ?? "", 10);
  const originPostalCode = normalizePostalCode(map.commerce_origin_postal_code ?? "01310100") || "01310100";
  const provider = (map.commerce_shipping_provider ?? "auto") as ShippingProviderMode;

  return {
    deliveryFeeCents:
      Number.isFinite(deliveryFee) && deliveryFee >= 0 ? deliveryFee : DEFAULT_DELIVERY_FEE_CENTS,
    originPostalCode,
    provider,
    melhorEnvioEnabled: Boolean(env.MELHOR_ENVIO_TOKEN)
  };
}

export function resolveFulfillmentOptions(items: ShippingProductInput[]) {
  const physical = items.filter((item) => item.kind === "PHYSICAL");
  if (physical.length === 0) {
    return { canPickup: false, canDeliver: false, defaultMethod: "DIGITAL" as ShippingMethod };
  }
  const canPickup = physical.every((item) => item.allowsPickup);
  const canDeliver = physical.some((item) => item.allowsDelivery);
  const defaultMethod: ShippingMethod = canDeliver ? "DELIVERY" : canPickup ? "PICKUP" : "DIGITAL";
  return { canPickup, canDeliver, defaultMethod };
}

async function resolveZoneFeeCents(postalCode: string, stateCode?: string | null) {
  const cep = normalizePostalCode(postalCode);
  const zones = await prisma.shippingZone.findMany({
    where: { isActive: true, deletedAt: null },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }]
  });

  for (const zone of zones) {
    if (zone.stateCode && stateCode && zone.stateCode.toUpperCase() === stateCode.toUpperCase()) {
      return { feeInCents: zone.feeInCents, zoneName: zone.name };
    }
    const from = normalizePostalCode(zone.postalFrom);
    const to = normalizePostalCode(zone.postalTo);
    if (from && to && cep >= from && cep <= to) {
      return { feeInCents: zone.feeInCents, zoneName: zone.name };
    }
  }

  return null;
}

async function quoteItemWithMelhorEnvio(input: {
  originPostalCode: string;
  destinationPostalCode: string;
  item: ShippingProductInput;
  selectedServiceId?: string | null;
}) {
  if (!env.MELHOR_ENVIO_TOKEN) return null;

  const baseUrl = env.MELHOR_ENVIO_SANDBOX
    ? "https://sandbox.melhorenvio.com.br"
    : "https://melhorenvio.com.br";

  const weightKg = Math.max(0.1, (input.item.weightGrams * input.item.quantity) / 1000);
  const insuranceValue = Math.max(1, (input.item.priceInCents * input.item.quantity) / 100);

  const response = await fetch(`${baseUrl}/api/v2/me/shipment/calculate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${env.MELHOR_ENVIO_TOKEN}`,
      "User-Agent": "AppTreino (contato@app-treino.local)"
    },
    signal: AbortSignal.timeout(12000),
    body: JSON.stringify({
      from: { postal_code: input.originPostalCode },
      to: { postal_code: input.destinationPostalCode },
      products: [
        {
          id: input.item.productId,
          width: input.item.widthCm,
          height: input.item.heightCm,
          length: input.item.lengthCm,
          weight: weightKg,
          insurance_value: insuranceValue,
          quantity: 1
        }
      ]
    })
  });

  if (!response.ok) return null;

  const payload = (await response.json()) as Array<{
    id?: number | string;
    name?: string;
    company?: { name?: string };
    price?: string | number;
    delivery_time?: number;
    custom_price?: string | number;
    error?: string;
  }>;

  const services: ShippingServiceOption[] = payload
    .filter((row) => !row.error && row.id != null)
    .map((row) => {
      const priceRaw = row.custom_price ?? row.price ?? 0;
      const priceNumber = typeof priceRaw === "string" ? Number.parseFloat(priceRaw) : priceRaw;
      return {
        id: String(row.id),
        name: row.name ?? "Serviço",
        company: row.company?.name ?? "Transportadora",
        priceInCents: Math.round(Math.max(0, priceNumber) * 100),
        deliveryDays: row.delivery_time ?? null
      };
    })
    .sort((a, b) => a.priceInCents - b.priceInCents);

  if (!services.length) return null;

  const selected =
    (input.selectedServiceId
      ? services.find((service) => service.id === input.selectedServiceId)
      : null) ?? services[0];

  return { services, selected };
}

async function quoteDeliverableItem(input: {
  item: ShippingProductInput;
  destinationPostalCode: string;
  destinationState?: string | null;
  settings: Awaited<ReturnType<typeof getCommerceShippingSettings>>;
  selectedServiceId?: string | null;
}): Promise<{ line: ItemShippingLine; services: ShippingServiceOption[]; quoteSource: string }> {
  if (input.item.kind === "DIGITAL" || !input.item.allowsDelivery) {
    return {
      line: {
        productId: input.item.productId,
        productName: input.item.name,
        quantity: input.item.quantity,
        shippingMethod: input.item.kind === "DIGITAL" ? "DIGITAL" : "PICKUP",
        shippingInCents: 0
      },
      services: [],
      quoteSource: "digital"
    };
  }

  if (input.item.shippingFeeInCents != null && input.item.shippingFeeInCents >= 0) {
    return {
      line: {
        productId: input.item.productId,
        productName: input.item.name,
        quantity: input.item.quantity,
        shippingMethod: "DELIVERY",
        shippingInCents: input.item.shippingFeeInCents * input.item.quantity
      },
      services: [],
      quoteSource: "product_fee"
    };
  }

  const tryMelhorEnvio =
    input.settings.melhorEnvioEnabled &&
    (input.settings.provider === "melhor_envio" || input.settings.provider === "auto");
  const tryZones =
    input.settings.provider === "zones" || input.settings.provider === "auto";

  if (tryMelhorEnvio) {
    const melhor = await quoteItemWithMelhorEnvio({
      originPostalCode: input.settings.originPostalCode,
      destinationPostalCode: input.destinationPostalCode,
      item: input.item,
      selectedServiceId: input.selectedServiceId
    });
    if (melhor) {
      return {
        line: {
          productId: input.item.productId,
          productName: input.item.name,
          quantity: input.item.quantity,
          shippingMethod: "DELIVERY",
          shippingInCents: melhor.selected.priceInCents,
          carrier: melhor.selected.company,
          serviceId: melhor.selected.id,
          serviceName: melhor.selected.name
        },
        services: melhor.services,
        quoteSource: "melhor_envio"
      };
    }
  }

  if (tryZones) {
    const zone = await resolveZoneFeeCents(input.destinationPostalCode, input.destinationState);
    if (zone) {
      return {
        line: {
          productId: input.item.productId,
          productName: input.item.name,
          quantity: input.item.quantity,
          shippingMethod: "DELIVERY",
          shippingInCents: zone.feeInCents * input.item.quantity
        },
        services: [],
        quoteSource: `zone:${zone.zoneName}`
      };
    }
  }

  return {
    line: {
      productId: input.item.productId,
      productName: input.item.name,
      quantity: input.item.quantity,
      shippingMethod: "DELIVERY",
      shippingInCents: input.settings.deliveryFeeCents * input.item.quantity
    },
    services: [],
    quoteSource: "flat"
  };
}

export async function quoteShipping(input: {
  items: ShippingProductInput[];
  fulfillmentMethod?: ShippingMethod | null;
  destination?: ShippingAddressInput | null;
  selectedServiceId?: string | null;
}) {
  const settings = await getCommerceShippingSettings();
  const { canPickup, canDeliver, defaultMethod } = resolveFulfillmentOptions(input.items);

  let fulfillmentMethod = input.fulfillmentMethod ?? defaultMethod;
  if (fulfillmentMethod === "DELIVERY" && !canDeliver) fulfillmentMethod = canPickup ? "PICKUP" : "DIGITAL";
  if (fulfillmentMethod === "PICKUP" && !canPickup && canDeliver) fulfillmentMethod = "DELIVERY";

  const allDigital = input.items.every((item) => item.kind === "DIGITAL");
  if (allDigital) fulfillmentMethod = "DIGITAL";

  if (fulfillmentMethod !== "DELIVERY") {
    const itemLines: ItemShippingLine[] = input.items.map((item) => ({
      productId: item.productId,
      productName: item.name,
      quantity: item.quantity,
      shippingMethod: item.kind === "DIGITAL" ? "DIGITAL" : fulfillmentMethod,
      shippingInCents: 0
    }));
    return {
      fulfillmentMethod,
      shippingMethod: fulfillmentMethod,
      shippingInCents: 0,
      itemLines,
      services: [] as ShippingServiceOption[],
      quoteSource: fulfillmentMethod === "DIGITAL" ? "digital" : "pickup",
      canPickup,
      canDeliver,
      formattedAddress: formatShippingAddress(input.destination ?? {})
    } satisfies ShippingQuoteResult;
  }

  const postalCode = normalizePostalCode(input.destination?.postalCode);
  if (!isValidPostalCode(postalCode)) {
    const error = new Error("Informe um CEP válido para calcular o frete.") as Error & { statusCode: number };
    error.statusCode = 400;
    throw error;
  }

  const deliverableItems = input.items.filter(
    (item) => item.kind === "PHYSICAL" && item.allowsDelivery
  );

  const mergedServices = new Map<string, ShippingServiceOption>();
  const itemLines: ItemShippingLine[] = [];
  const quoteSources: string[] = [];

  for (const item of input.items) {
    if (item.kind === "DIGITAL" || !item.allowsDelivery) {
      itemLines.push({
        productId: item.productId,
        productName: item.name,
        quantity: item.quantity,
        shippingMethod: item.kind === "DIGITAL" ? "DIGITAL" : "PICKUP",
        shippingInCents: 0
      });
      continue;
    }

    const quoted = await quoteDeliverableItem({
      item,
      destinationPostalCode: postalCode,
      destinationState: input.destination?.state,
      settings,
      selectedServiceId: input.selectedServiceId
    });
    itemLines.push(quoted.line);
    quoteSources.push(quoted.quoteSource);
    for (const service of quoted.services) {
      mergedServices.set(service.id, service);
    }
  }

  const shippingInCents = itemLines.reduce((sum, line) => sum + line.shippingInCents, 0);
  const services = Array.from(mergedServices.values()).sort((a, b) => a.priceInCents - b.priceInCents);

  return {
    fulfillmentMethod: "DELIVERY" as ShippingMethod,
    shippingMethod: "DELIVERY" as ShippingMethod,
    shippingInCents,
    itemLines,
    services,
    quoteSource: quoteSources.join("+") || "flat",
    canPickup,
    canDeliver,
    formattedAddress: formatShippingAddress({ ...input.destination, postalCode })
  } satisfies ShippingQuoteResult;
}

export function productToShippingInput(product: {
  id: string;
  name: string;
  kind: ProductKind;
  priceInCents: number;
  allowsPickup: boolean;
  allowsDelivery: boolean;
  shippingFeeInCents: number | null;
  weightGrams: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
}, quantity: number): ShippingProductInput {
  return {
    productId: product.id,
    name: product.name,
    kind: product.kind,
    quantity,
    priceInCents: product.priceInCents,
    allowsPickup: product.allowsPickup,
    allowsDelivery: product.allowsDelivery,
    shippingFeeInCents: product.shippingFeeInCents,
    weightGrams: product.weightGrams,
    lengthCm: product.lengthCm,
    widthCm: product.widthCm,
    heightCm: product.heightCm
  };
}
