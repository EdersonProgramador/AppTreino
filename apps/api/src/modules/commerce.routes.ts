import type { FastifyInstance } from "fastify";
import type { Order, OrderItem } from "@prisma/client";
import { z } from "zod";
import { isValidCpf, normalizeCpfDigits } from "@app-treino/shared";
import { isAdminStudentPreview, requireAuth, requireRole } from "../auth.js";
import { notifyOrderPlaced, notifyOrderStatusChange } from "../email-notifications.js";
import { env } from "../env.js";
import { prisma } from "../prisma.js";
import {
  buildStoreOrderCheckoutResponse,
  finalizeNativePurchaseCheckout,
  payNativeOrderWithCard,
  payNativePurchaseWithCard,
  prepareNativeOrderCheckout,
  resolveStorePixCpf,
  syncOrderPaymentFromAsaas,
  syncPurchasePaymentFromAsaas
} from "./commerce.checkout.native.js";
import { getAsaasCheckoutAmountError, resolveStoreCardInstallment } from "./checkout.utils.js";
import { buildPaginationMeta, parsePagination } from "./pagination.js";
import {
  assertModuleEnabled,
  applyOrderStatusSideEffects,
  buildCartTotals,
  clearCartAfterCheckout,
  findValidCoupon,
  getOrCreateCart,
  ORDER_PAID_STATUSES,
  resolveOrderTimestamps
} from "./commerce.utils.js";
import {
  formatShippingAddress,
  lookupPostalCode,
  normalizePostalCode,
  quoteShipping,
  productToShippingInput
} from "./shipping.service.js";

function requireDatabase() {
  if (!env.DATABASE_URL) {
    const error = new Error("Banco de dados não configurado para esta operação.") as Error & {
      statusCode: number;
    };
    error.statusCode = 503;
    throw error;
  }
}

function httpError(statusCode: number, message: string) {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
}

const cartItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().min(1).max(99).default(1)
});

const cartCouponSchema = z.object({
  code: z.string().trim().min(1).max(40).nullable()
});

const cartCheckoutSchema = z.object({
  shippingAddress: z.string().trim().max(500).optional().or(z.literal("")),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
  billingType: z.enum(["BOLETO", "CREDIT_CARD", "PIX", "UNDEFINED"]).default("PIX"),
  cpfCnpj: z.string().trim().optional()
});

const storePaymentSessionSchema = z.object({
  billingType: z.enum(["BOLETO", "CREDIT_CARD", "PIX", "UNDEFINED"]).default("PIX"),
  cpfCnpj: z.string().trim().optional()
});

const storeCardPaymentSchema = z.object({
  holderName: z.string().trim().min(3, "Informe o nome impresso no cartão."),
  number: z.string().trim().min(13, "Informe o número do cartão."),
  expiryMonth: z.string().trim().min(2).max(2),
  expiryYear: z.string().trim().min(2).max(4),
  ccv: z.string().trim().min(3).max(4),
  holderEmail: z.string().trim().email("Informe um e-mail válido."),
  holderCpfCnpj: z
    .string()
    .trim()
    .min(11, "Informe o CPF do titular.")
    .refine((value) => isValidCpf(value), "Informe um CPF valido."),
  holderPostalCode: z.string().trim().min(8, "Informe o CEP."),
  holderAddressNumber: z.string().trim().min(1, "Informe o número do endereço."),
  holderPhone: z.string().trim().min(8, "Informe o telefone do titular."),
  installmentCount: z.coerce.number().int().min(1).max(12).optional()
});

async function loadStoreCheckoutUser(userId: string) {
  return prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: { profile: true }
  });
}

async function finalizeNativeOrderCheckout(input: {
  order: Order & { items: OrderItem[] };
  userId: string;
  billingType: "BOLETO" | "CREDIT_CARD" | "PIX" | "UNDEFINED";
  cpfCnpj?: string | null;
}) {
  if (input.billingType === "UNDEFINED") {
    return buildStoreOrderCheckoutResponse({
      order: input.order,
      alreadyPaid: false
    });
  }

  const user = await loadStoreCheckoutUser(input.userId);
  const native = await prepareNativeOrderCheckout({
    order: input.order,
    user,
    billingType: input.billingType,
    cpfCnpj: input.cpfCnpj
  });

  return buildStoreOrderCheckoutResponse({
    order: native.order,
    alreadyPaid: false,
    nativeCheckout: native.nativeCheckout,
    paymentProviderError: native.providerError
  });
}

const couponSchema = z
  .object({
    code: z.string().trim().min(2).max(40),
    description: z.string().trim().max(200).optional().or(z.literal("")),
    scope: z.enum(["STORE", "SUBSCRIPTION", "ALL"]).default("STORE"),
    percentOff: z.number().int().min(1).max(100).nullable().optional(),
    amountOffCents: z.number().int().min(1).nullable().optional(),
    minOrderCents: z.number().int().min(0).default(0),
    maxUses: z.number().int().min(1).nullable().optional(),
    isActive: z.boolean().default(true),
    startsAt: z.coerce.date().nullable().optional(),
    endsAt: z.coerce.date().nullable().optional()
  })
  .superRefine((data, ctx) => {
    if (!data.percentOff && !data.amountOffCents) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Informe desconto percentual ou valor fixo."
      });
    }
  });

const updateCouponSchema = z.object({
  code: z.string().trim().min(2).max(40).optional(),
  description: z.string().trim().max(200).optional().or(z.literal("")),
  scope: z.enum(["STORE", "SUBSCRIPTION", "ALL"]).optional(),
  percentOff: z.number().int().min(1).max(100).nullable().optional(),
  amountOffCents: z.number().int().min(1).nullable().optional(),
  minOrderCents: z.number().int().min(0).optional(),
  maxUses: z.number().int().min(1).nullable().optional(),
  isActive: z.boolean().optional(),
  startsAt: z.coerce.date().nullable().optional(),
  endsAt: z.coerce.date().nullable().optional()
});

const orderStatusSchema = z.object({
  status: z.enum(["PENDING", "CONFIRMED", "READY", "DELIVERED", "CANCELED", "REFUNDED"])
});

const destinationSchema = z.object({
  postalCode: z.string().trim().optional(),
  street: z.string().trim().max(200).optional(),
  number: z.string().trim().max(40).optional(),
  complement: z.string().trim().max(120).optional(),
  neighborhood: z.string().trim().max(120).optional(),
  city: z.string().trim().max(120).optional(),
  state: z.string().trim().max(2).optional()
});

const cartShippingSchema = z.object({
  fulfillmentMethod: z.enum(["PICKUP", "DELIVERY"]).optional(),
  destination: destinationSchema.optional(),
  shippingServiceId: z.string().trim().max(80).nullable().optional(),
  shippingServiceName: z.string().trim().max(120).nullable().optional(),
  shippingCarrier: z.string().trim().max(120).nullable().optional()
});

const shippingZoneSchema = z.object({
  name: z.string().trim().min(2).max(120),
  stateCode: z.string().trim().max(2).nullable().optional(),
  postalFrom: z.string().trim().max(8).nullable().optional(),
  postalTo: z.string().trim().max(8).nullable().optional(),
  feeInCents: z.number().int().min(0),
  priority: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true)
});

async function serializeCart(userId: string) {
  const cart = await getOrCreateCart(userId);
  const totals = await buildCartTotals(cart);
  const quote = totals.shippingQuote;
  const lineMap = new Map(quote.itemLines.map((line) => [line.productId, line]));

  return {
    cart: {
      id: cart.id,
      couponCode: totals.couponCode ?? cart.couponCode,
      subtotalInCents: totals.subtotalInCents,
      discountInCents: totals.discountInCents,
      shippingInCents: totals.shippingInCents,
      shippingMethod: totals.shippingMethod,
      amountInCents: totals.amountInCents,
      itemCount: totals.itemCount,
      fulfillmentMethod: quote.fulfillmentMethod,
      canPickup: quote.canPickup,
      canDeliver: quote.canDeliver,
      quoteSource: quote.quoteSource,
      shippingServices: quote.services,
      destination: {
        postalCode: cart.destinationPostalCode,
        street: cart.destinationStreet,
        number: cart.destinationNumber,
        complement: cart.destinationComplement,
        neighborhood: cart.destinationNeighborhood,
        city: cart.destinationCity,
        state: cart.destinationState
      },
      shippingServiceId: cart.shippingServiceId,
      shippingServiceName: cart.shippingServiceName,
      shippingCarrier: cart.shippingCarrier,
      formattedAddress: quote.formattedAddress,
      items: totals.items.map((item) => {
        const line = lineMap.get(item.productId);
        return {
          id: item.id,
          productId: item.productId,
          quantity: item.quantity,
          product: item.product,
          lineTotalInCents: item.product.priceInCents * item.quantity,
          shippingInCents: line?.shippingInCents ?? 0,
          shippingMethod: line?.shippingMethod ?? "PICKUP"
        };
      })
    }
  };
}

export async function registerCommerceRoutes(app: FastifyInstance) {
  // ----- Student cart -----
  app.get("/student/cart", async (request) => {
    requireDatabase();
    await assertModuleEnabled("module_products");
    const authUser = await requireAuth(app, request);
    return serializeCart(authUser.id);
  });

  app.get("/student/shipping/cep/:cep", async (request) => {
    requireDatabase();
    await assertModuleEnabled("module_products");
    await requireAuth(app, request);
    const { cep } = z.object({ cep: z.string().min(8).max(9) }).parse(request.params);
    const address = await lookupPostalCode(cep);
    return { address };
  });

  app.post("/student/shipping/quote", async (request) => {
    requireDatabase();
    await assertModuleEnabled("module_products");
    await requireAuth(app, request);
    const body = z
      .object({
        productId: z.string().min(1),
        quantity: z.number().int().min(1).max(99).default(1),
        fulfillmentMethod: z.enum(["PICKUP", "DELIVERY"]).optional(),
        destination: destinationSchema.optional(),
        shippingServiceId: z.string().trim().max(80).nullable().optional()
      })
      .parse(request.body ?? {});

    const product = await prisma.product.findFirst({
      where: { id: body.productId, isActive: true, deletedAt: null }
    });
    if (!product) throw httpError(404, "Produto não encontrado.");

    const quote = await quoteShipping({
      items: [productToShippingInput(product, body.quantity)],
      fulfillmentMethod: body.fulfillmentMethod ?? null,
      destination: body.destination ?? null,
      selectedServiceId: body.shippingServiceId ?? null
    });

    return {
      quote: {
        fulfillmentMethod: quote.fulfillmentMethod,
        shippingMethod: quote.shippingMethod,
        shippingInCents: quote.shippingInCents,
        amountInCents: product.priceInCents * body.quantity + quote.shippingInCents,
        services: quote.services,
        quoteSource: quote.quoteSource,
        canPickup: quote.canPickup,
        canDeliver: quote.canDeliver,
        itemLines: quote.itemLines.map((line) => ({
          productId: line.productId,
          shippingInCents: line.shippingInCents,
          shippingMethod: line.shippingMethod
        }))
      }
    };
  });

  app.put("/student/cart/shipping", async (request) => {
    requireDatabase();
    await assertModuleEnabled("module_products");
    const authUser = await requireAuth(app, request);
    if (isAdminStudentPreview(authUser)) {
      throw httpError(403, "Preview admin não pode alterar o carrinho.");
    }
    const body = cartShippingSchema.parse(request.body ?? {});
    const cart = await getOrCreateCart(authUser.id);

    let destination = body.destination ?? {};
    if (destination.postalCode && !destination.street) {
      try {
        const lookedUp = await lookupPostalCode(destination.postalCode);
        destination = { ...lookedUp, ...destination, postalCode: lookedUp.postalCode };
      } catch {
        // Mantém o que o aluno informou manualmente.
      }
    }

    await prisma.cart.update({
      where: { id: cart.id },
      data: {
        fulfillmentMethod: body.fulfillmentMethod ?? cart.fulfillmentMethod,
        destinationPostalCode: destination.postalCode
          ? normalizePostalCode(destination.postalCode)
          : cart.destinationPostalCode,
        destinationStreet: destination.street ?? cart.destinationStreet,
        destinationNumber: destination.number ?? cart.destinationNumber,
        destinationComplement: destination.complement ?? cart.destinationComplement,
        destinationNeighborhood: destination.neighborhood ?? cart.destinationNeighborhood,
        destinationCity: destination.city ?? cart.destinationCity,
        destinationState: destination.state ?? cart.destinationState,
        shippingServiceId:
          body.shippingServiceId === undefined ? cart.shippingServiceId : body.shippingServiceId,
        shippingServiceName:
          body.shippingServiceName === undefined ? cart.shippingServiceName : body.shippingServiceName,
        shippingCarrier: body.shippingCarrier === undefined ? cart.shippingCarrier : body.shippingCarrier
      }
    });

    return serializeCart(authUser.id);
  });

  app.post("/student/cart/items", async (request, reply) => {
    requireDatabase();
    await assertModuleEnabled("module_products");
    const authUser = await requireAuth(app, request);
    if (isAdminStudentPreview(authUser)) {
      throw httpError(403, "Preview admin não pode alterar o carrinho.");
    }
    const body = cartItemSchema.parse(request.body);
    const product = await prisma.product.findFirst({
      where: { id: body.productId, isActive: true, deletedAt: null }
    });
    if (!product) throw httpError(404, "Produto não encontrado.");
    if (product.stock != null && product.stock < body.quantity) {
      throw httpError(400, "Esse é o máximo disponível por enquanto.");
    }

    const cart = await getOrCreateCart(authUser.id);
    const existing = cart.items.find((item) => item.productId === body.productId);
    const nextQty = (existing?.quantity ?? 0) + body.quantity;
    if (product.stock != null && product.stock < nextQty) {
      throw httpError(400, "Esse é o máximo disponível por enquanto.");
    }

    if (existing) {
      await prisma.cartItem.update({
        where: { id: existing.id },
        data: { quantity: nextQty }
      });
    } else {
      await prisma.cartItem.create({
        data: {
          cartId: cart.id,
          productId: product.id,
          quantity: body.quantity
        }
      });
    }

    return reply.code(201).send(await serializeCart(authUser.id));
  });

  app.put("/student/cart/items/:productId", async (request) => {
    requireDatabase();
    await assertModuleEnabled("module_products");
    const authUser = await requireAuth(app, request);
    if (isAdminStudentPreview(authUser)) {
      throw httpError(403, "Preview admin não pode alterar o carrinho.");
    }
    const { productId } = z.object({ productId: z.string().min(1) }).parse(request.params);
    const body = z.object({ quantity: z.number().int().min(0).max(99) }).parse(request.body);
    const cart = await getOrCreateCart(authUser.id);
    const item = cart.items.find((entry) => entry.productId === productId);
    if (!item) throw httpError(404, "Item não encontrado no carrinho.");

    if (body.quantity === 0) {
      await prisma.cartItem.delete({ where: { id: item.id } });
    } else {
      if (item.product.stock != null && item.product.stock < body.quantity) {
        throw httpError(400, "Esse é o máximo disponível por enquanto.");
      }
      await prisma.cartItem.update({
        where: { id: item.id },
        data: { quantity: body.quantity }
      });
    }

    return serializeCart(authUser.id);
  });

  app.delete("/student/cart/items/:productId", async (request) => {
    requireDatabase();
    await assertModuleEnabled("module_products");
    const authUser = await requireAuth(app, request);
    if (isAdminStudentPreview(authUser)) {
      throw httpError(403, "Preview admin não pode alterar o carrinho.");
    }
    const { productId } = z.object({ productId: z.string().min(1) }).parse(request.params);
    const cart = await getOrCreateCart(authUser.id);
    await prisma.cartItem.deleteMany({ where: { cartId: cart.id, productId } });
    return serializeCart(authUser.id);
  });

  app.put("/student/cart/coupon", async (request) => {
    requireDatabase();
    await assertModuleEnabled("module_products");
    const authUser = await requireAuth(app, request);
    if (isAdminStudentPreview(authUser)) {
      throw httpError(403, "Preview admin não pode alterar o carrinho.");
    }
    const body = cartCouponSchema.parse(request.body);
    const cart = await getOrCreateCart(authUser.id);
    const code = body.code?.trim() ? body.code.trim().toUpperCase() : null;

    if (code) {
      const subtotal = cart.items.reduce((sum, item) => sum + item.product.priceInCents * item.quantity, 0);
      await findValidCoupon(code, subtotal, { scope: "STORE" });
    }

    await prisma.cart.update({
      where: { id: cart.id },
      data: { couponCode: code }
    });

    return serializeCart(authUser.id);
  });

  app.post("/student/cart/checkout", async (request, reply) => {
    requireDatabase();
    await assertModuleEnabled("module_purchases");
    const authUser = await requireAuth(app, request);
    if (isAdminStudentPreview(authUser)) {
      throw httpError(403, "Preview admin não pode finalizar pedidos.");
    }
    const body = cartCheckoutSchema.parse(request.body);
    const cart = await getOrCreateCart(authUser.id);
    if (cart.items.length === 0) throw httpError(400, "Carrinho vazio.");

    for (const item of cart.items) {
      if (!item.product.isActive || item.product.deletedAt) {
        throw httpError(400, `Produto "${item.product.name}" não está mais disponível.`);
      }
      if (item.product.stock != null && item.product.stock < item.quantity) {
        throw httpError(400, "Esse é o máximo disponível por enquanto.");
      }
    }

    const totals = await buildCartTotals(cart);
    if (totals.items.length === 0) throw httpError(400, "Carrinho sem itens válidos.");

    const amountError = getAsaasCheckoutAmountError(totals.amountInCents);
    if (amountError) throw httpError(400, amountError);

    const formattedAddress =
      formatShippingAddress({
        postalCode: cart.destinationPostalCode,
        street: cart.destinationStreet,
        number: cart.destinationNumber,
        complement: cart.destinationComplement,
        neighborhood: cart.destinationNeighborhood,
        city: cart.destinationCity,
        state: cart.destinationState
      }) ??
      body.shippingAddress?.trim() ??
      null;

    if (totals.shippingMethod === "DELIVERY") {
      if (!cart.destinationPostalCode || !cart.destinationStreet || !cart.destinationNumber) {
        throw httpError(400, "Informe CEP, rua e número para entrega.");
      }
    }

    const lineMap = new Map(totals.shippingQuote.itemLines.map((line) => [line.productId, line]));

    const order = await prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          userId: authUser.id,
          status: "PENDING",
          subtotalInCents: totals.subtotalInCents,
          discountInCents: totals.discountInCents,
          shippingInCents: totals.shippingInCents,
          amountInCents: totals.amountInCents,
          shippingMethod: totals.shippingMethod,
          shippingAddress: totals.shippingMethod === "DELIVERY" ? formattedAddress : null,
          destinationPostalCode: cart.destinationPostalCode,
          destinationStreet: cart.destinationStreet,
          destinationNumber: cart.destinationNumber,
          destinationComplement: cart.destinationComplement,
          destinationNeighborhood: cart.destinationNeighborhood,
          destinationCity: cart.destinationCity,
          destinationState: cart.destinationState,
          shippingCarrier: cart.shippingCarrier,
          shippingServiceId: cart.shippingServiceId,
          shippingServiceName: cart.shippingServiceName,
          shippingQuoteSource: totals.shippingQuote.quoteSource,
          couponId: totals.couponId,
          couponCode: totals.couponCode,
          notes: body.notes?.trim() || null,
          paymentMethod: body.billingType === "UNDEFINED" ? null : body.billingType,
          items: {
            create: totals.items.map((item) => {
              const line = lineMap.get(item.productId);
              return {
                productId: item.productId,
                productName: item.product.name,
                quantity: item.quantity,
                unitPriceInCents: item.product.priceInCents,
                amountInCents: item.product.priceInCents * item.quantity,
                shippingInCents: line?.shippingInCents ?? 0,
                shippingMethod: line?.shippingMethod ?? totals.shippingMethod,
                shippingCarrier: line?.carrier ?? cart.shippingCarrier,
                shippingServiceId: line?.serviceId ?? cart.shippingServiceId,
                shippingServiceName: line?.serviceName ?? cart.shippingServiceName
              };
            })
          }
        },
        include: { items: true, user: true }
      });

      return created;
    });

    await clearCartAfterCheckout(cart.id);

    notifyOrderPlaced(order);

    const cpfResolution = await resolveStorePixCpf(authUser.id, body.billingType, body.cpfCnpj);
    const checkoutResult = await finalizeNativeOrderCheckout({
      order,
      userId: authUser.id,
      billingType: body.billingType,
      cpfCnpj: "error" in cpfResolution ? null : cpfResolution.cpfCnpj
    });

    return reply.code(201).send(checkoutResult);
  });

  app.get("/student/orders", async (request) => {
    requireDatabase();
    await assertModuleEnabled("module_purchases");
    const authUser = await requireAuth(app, request);
    const orders = await prisma.order.findMany({
      where: { userId: authUser.id, deletedAt: null },
      include: { items: true },
      orderBy: { createdAt: "desc" },
      take: 50
    });
    return { orders };
  });

  app.get("/student/store/summary", async (request) => {
    requireDatabase();
    await assertModuleEnabled("module_purchases");
    const authUser = await requireAuth(app, request);

    const [orders, purchases, cartSnapshot] = await Promise.all([
      prisma.order.findMany({
        where: { userId: authUser.id, deletedAt: null },
        include: { items: true },
        orderBy: { createdAt: "desc" },
        take: 50
      }),
      prisma.purchase.findMany({
        where: { userId: authUser.id, deletedAt: null },
        include: { product: true },
        orderBy: { createdAt: "desc" },
        take: 50
      }),
      (async () => {
        try {
          await assertModuleEnabled("module_products");
          const cart = await getOrCreateCart(authUser.id);
          const totals = await buildCartTotals(cart);
          return { itemCount: totals.itemCount, amountInCents: totals.amountInCents };
        } catch {
          return { itemCount: 0, amountInCents: 0 };
        }
      })()
    ]);

    const pendingCount =
      orders.filter((order) => order.status === "PENDING").length +
      purchases.filter((purchase) => purchase.status === "PENDING").length;

    return {
      cartItemCount: cartSnapshot.itemCount,
      cartAmountInCents: cartSnapshot.amountInCents,
      orderCount: orders.length,
      purchaseCount: purchases.length,
      pendingCount,
      orders: orders.slice(0, 8),
      purchases: purchases.slice(0, 8)
    };
  });

  app.post("/student/orders/:id/checkout", async (request) => {
    requireDatabase();
    await assertModuleEnabled("module_purchases");
    const authUser = await requireAuth(app, request);
    if (isAdminStudentPreview(authUser)) {
      throw httpError(403, "Preview admin não pode pagar pedidos.");
    }
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = storePaymentSessionSchema.parse(request.body ?? {});

    const order = await prisma.order.findFirst({
      where: { id, userId: authUser.id, deletedAt: null },
      include: { items: true }
    });
    if (!order) throw httpError(404, "Pedido não encontrado.");
    if (ORDER_PAID_STATUSES.includes(order.status)) {
      return buildStoreOrderCheckoutResponse({ order, alreadyPaid: true });
    }
    if (order.status !== "PENDING") throw httpError(400, "Este pedido não pode mais ser pago.");

    const amountError = getAsaasCheckoutAmountError(order.amountInCents);
    if (amountError) throw httpError(400, amountError);

    const cpfResolution = await resolveStorePixCpf(authUser.id, body.billingType, body.cpfCnpj);
    if ("error" in cpfResolution && cpfResolution.error) {
      throw httpError(400, cpfResolution.error);
    }

    return finalizeNativeOrderCheckout({
      order,
      userId: authUser.id,
      billingType: body.billingType,
      cpfCnpj: cpfResolution.cpfCnpj
    });
  });

  app.post("/student/orders/:id/payment/session", async (request) => {
    requireDatabase();
    await assertModuleEnabled("module_purchases");
    const authUser = await requireAuth(app, request);
    if (isAdminStudentPreview(authUser)) {
      throw httpError(403, "Preview admin não pode pagar pedidos.");
    }
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = storePaymentSessionSchema.parse(request.body ?? {});

    const order = await prisma.order.findFirst({
      where: { id, userId: authUser.id, deletedAt: null },
      include: { items: true }
    });
    if (!order) throw httpError(404, "Pedido não encontrado.");
    if (ORDER_PAID_STATUSES.includes(order.status)) {
      return buildStoreOrderCheckoutResponse({ order, alreadyPaid: true });
    }
    if (order.status !== "PENDING") throw httpError(400, "Este pedido não pode mais ser pago.");

    const amountError = getAsaasCheckoutAmountError(order.amountInCents);
    if (amountError) throw httpError(400, amountError);

    const cpfResolution = await resolveStorePixCpf(authUser.id, body.billingType, body.cpfCnpj);
    if ("error" in cpfResolution && cpfResolution.error) {
      throw httpError(400, cpfResolution.error);
    }

    return finalizeNativeOrderCheckout({
      order,
      userId: authUser.id,
      billingType: body.billingType,
      cpfCnpj: cpfResolution.cpfCnpj
    });
  });

  app.get("/student/orders/:id/payment/status", async (request) => {
    requireDatabase();
    await assertModuleEnabled("module_purchases");
    const authUser = await requireAuth(app, request);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);

    let order = await prisma.order.findFirst({
      where: { id, userId: authUser.id, deletedAt: null },
      include: { items: true, user: true }
    });
    if (!order) throw httpError(404, "Pedido não encontrado.");

    let currentOrder = order;
    if (currentOrder.status === "PENDING") {
      try {
        const synced = await syncOrderPaymentFromAsaas(currentOrder);
        if (synced?.order) currentOrder = synced.order as typeof currentOrder;
      } catch (error) {
        request.log.warn({ err: error, orderId: currentOrder.id }, "Asaas order status sync failed");
      }
    }

    return {
      order: currentOrder,
      alreadyPaid: ORDER_PAID_STATUSES.includes(currentOrder.status),
      syncedFromAsaas: ORDER_PAID_STATUSES.includes(currentOrder.status)
    };
  });

  app.post("/student/orders/:id/payment/card", async (request) => {
    requireDatabase();
    await assertModuleEnabled("module_purchases");
    const authUser = await requireAuth(app, request);
    if (isAdminStudentPreview(authUser)) {
      throw httpError(403, "Preview admin não pode pagar pedidos.");
    }

    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = storeCardPaymentSchema.parse(request.body);

    const order = await prisma.order.findFirst({
      where: { id, userId: authUser.id, deletedAt: null, status: "PENDING" },
      include: { items: true, user: true }
    });
    if (!order) throw httpError(404, "Pedido não encontrado.");

    if (ORDER_PAID_STATUSES.includes(order.status)) {
      return buildStoreOrderCheckoutResponse({ order, alreadyPaid: true });
    }

    const installmentResolution = resolveStoreCardInstallment({
      installmentCount: body.installmentCount,
      amountInCents: order.amountInCents
    });
    if (!installmentResolution.ok) {
      throw httpError(400, installmentResolution.error);
    }

    const user = await loadStoreCheckoutUser(authUser.id);
    const cardResult = await payNativeOrderWithCard({
      order,
      user,
      creditCard: {
        holderName: body.holderName,
        number: body.number,
        expiryMonth: body.expiryMonth,
        expiryYear: body.expiryYear,
        ccv: body.ccv
      },
      creditCardHolderInfo: {
        name: body.holderName,
        email: body.holderEmail,
        cpfCnpj: body.holderCpfCnpj,
        postalCode: body.holderPostalCode,
        addressNumber: body.holderAddressNumber,
        phone: body.holderPhone
      },
      remoteIp: request.ip,
      installmentCount: installmentResolution.installmentCount
    });

    return buildStoreOrderCheckoutResponse({
      order: cardResult.order,
      alreadyPaid: ORDER_PAID_STATUSES.includes(cardResult.order.status),
      paymentProviderError: cardResult.providerError
    });
  });

  // ----- Admin shipping zones -----
  app.get("/admin/shipping/zones", async (request) => {
    requireDatabase();
    await requireRole(app, request, "ADMIN");
    await assertModuleEnabled("module_products");
    const zones = await prisma.shippingZone.findMany({
      where: { deletedAt: null },
      orderBy: [{ priority: "desc" }, { name: "asc" }]
    });
    return { zones };
  });

  app.post("/admin/shipping/zones", async (request, reply) => {
    requireDatabase();
    await requireRole(app, request, "ADMIN");
    await assertModuleEnabled("module_products");
    const body = shippingZoneSchema.parse(request.body);
    const zone = await prisma.shippingZone.create({
      data: {
        name: body.name,
        stateCode: body.stateCode?.trim().toUpperCase() || null,
        postalFrom: body.postalFrom ? normalizePostalCode(body.postalFrom) : null,
        postalTo: body.postalTo ? normalizePostalCode(body.postalTo) : null,
        feeInCents: body.feeInCents,
        priority: body.priority,
        isActive: body.isActive
      }
    });
    return reply.code(201).send({ zone });
  });

  app.put("/admin/shipping/zones/:id", async (request) => {
    requireDatabase();
    await requireRole(app, request, "ADMIN");
    await assertModuleEnabled("module_products");
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = shippingZoneSchema.partial().parse(request.body);
    const zone = await prisma.shippingZone.update({
      where: { id },
      data: {
        name: body.name,
        stateCode: body.stateCode === undefined ? undefined : body.stateCode?.trim().toUpperCase() || null,
        postalFrom:
          body.postalFrom === undefined ? undefined : body.postalFrom ? normalizePostalCode(body.postalFrom) : null,
        postalTo: body.postalTo === undefined ? undefined : body.postalTo ? normalizePostalCode(body.postalTo) : null,
        feeInCents: body.feeInCents,
        priority: body.priority,
        isActive: body.isActive
      }
    });
    return { zone };
  });

  app.delete("/admin/shipping/zones/:id", async (request) => {
    requireDatabase();
    await requireRole(app, request, "ADMIN");
    await assertModuleEnabled("module_products");
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    await prisma.shippingZone.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false }
    });
    return { ok: true };
  });

  // ----- Admin coupons -----
  app.get("/admin/coupons", async (request) => {
    requireDatabase();
    await requireRole(app, request, "ADMIN");
    await assertModuleEnabled("module_products");
    const { page, perPage, skip, take } = parsePagination(request.query as Record<string, unknown>);
    const where = { deletedAt: null };
    const [coupons, total] = await Promise.all([
      prisma.coupon.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      prisma.coupon.count({ where })
    ]);
    return { coupons, meta: buildPaginationMeta(total, page, perPage) };
  });

  app.post("/admin/coupons", async (request, reply) => {
    requireDatabase();
    await requireRole(app, request, "ADMIN");
    await assertModuleEnabled("module_products");
    const body = couponSchema.parse(request.body);
    const coupon = await prisma.coupon.create({
      data: {
        code: body.code.trim().toUpperCase(),
        description: body.description || null,
        scope: body.scope,
        percentOff: body.percentOff ?? null,
        amountOffCents: body.amountOffCents ?? null,
        minOrderCents: body.minOrderCents,
        maxUses: body.maxUses ?? null,
        isActive: body.isActive,
        startsAt: body.startsAt ?? null,
        endsAt: body.endsAt ?? null
      }
    });
    return reply.code(201).send({ coupon });
  });

  app.put("/admin/coupons/:id", async (request) => {
    requireDatabase();
    await requireRole(app, request, "ADMIN");
    await assertModuleEnabled("module_products");
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = updateCouponSchema.parse(request.body);
    const coupon = await prisma.coupon.update({
      where: { id },
      data: {
        ...body,
        ...(body.code ? { code: body.code.trim().toUpperCase() } : {}),
        ...(body.description !== undefined ? { description: body.description || null } : {})
      }
    });
    return { coupon };
  });

  app.delete("/admin/coupons/:id", async (request) => {
    requireDatabase();
    await requireRole(app, request, "ADMIN");
    await assertModuleEnabled("module_products");
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    await prisma.coupon.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false }
    });
    return { ok: true };
  });

  // ----- Admin orders -----
  app.get("/admin/orders", async (request) => {
    requireDatabase();
    await requireRole(app, request, "ADMIN");
    await assertModuleEnabled("module_purchases");
    const { page, perPage, skip, take } = parsePagination(request.query as Record<string, unknown>);
    const where = { deletedAt: null };
    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: { user: true, items: true, coupon: true },
        orderBy: { createdAt: "desc" },
        skip,
        take
      }),
      prisma.order.count({ where })
    ]);
    return { orders, meta: buildPaginationMeta(total, page, perPage) };
  });

  app.put("/admin/orders/:id", async (request) => {
    requireDatabase();
    await requireRole(app, request, "ADMIN");
    await assertModuleEnabled("module_purchases");
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = orderStatusSchema.parse(request.body);
    const current = await prisma.order.findUniqueOrThrow({
      where: { id },
      include: { items: true }
    });
    const timestamps = resolveOrderTimestamps(body.status, {
      paidAt: current.paidAt,
      fulfilledAt: current.fulfilledAt
    });
    const order = await prisma.order.update({
      where: { id },
      data: { status: body.status, ...timestamps },
      include: { user: true, items: true, coupon: true }
    });

    if (body.status !== current.status) {
      await applyOrderStatusSideEffects(current, current.status, body.status);
      notifyOrderStatusChange({
        order,
        previousStatus: current.status,
        nextStatus: body.status
      });
    }

    return { order };
  });

  app.delete("/admin/orders/:id", async (request) => {
    requireDatabase();
    await requireRole(app, request, "ADMIN");
    await assertModuleEnabled("module_purchases");
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    await prisma.order.update({
      where: { id },
      data: { deletedAt: new Date() }
    });
    return { ok: true };
  });
}
