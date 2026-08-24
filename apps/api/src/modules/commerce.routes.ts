import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { isAdminStudentPreview, requireAuth, requireRole } from "../auth.js";
import { env } from "../env.js";
import { prisma } from "../prisma.js";
import { createAsaasCheckout, orderExternalReference, type AsaasBillingType } from "./asaas.client.js";
import { asaasCheckoutItemName } from "./checkout.utils.js";
import { buildPaginationMeta, parsePagination } from "./pagination.js";
import {
  assertModuleEnabled,
  buildCartTotals,
  decrementProductStock,
  findValidCoupon,
  getOrCreateCart,
  ORDER_PAID_STATUSES,
  resolveOrderTimestamps
} from "./commerce.utils.js";

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
  billingType: z.enum(["BOLETO", "CREDIT_CARD", "PIX", "UNDEFINED"]).default("UNDEFINED")
});

const couponSchema = z
  .object({
    code: z.string().trim().min(2).max(40),
    description: z.string().trim().max(200).optional().or(z.literal("")),
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

async function serializeCart(userId: string) {
  const cart = await getOrCreateCart(userId);
  const totals = await buildCartTotals(cart);
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
      items: totals.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        quantity: item.quantity,
        product: item.product,
        lineTotalInCents: item.product.priceInCents * item.quantity
      }))
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
      await findValidCoupon(code, subtotal);
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

    if (totals.shippingMethod === "DELIVERY" && !body.shippingAddress?.trim()) {
      throw httpError(400, "Informe o endereço para entrega.");
    }

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
          shippingAddress:
            totals.shippingMethod === "DELIVERY" ? body.shippingAddress?.trim() || null : null,
          couponId: totals.couponId,
          couponCode: totals.couponCode,
          notes: body.notes?.trim() || null,
          paymentMethod: body.billingType === "UNDEFINED" ? null : body.billingType,
          items: {
            create: totals.items.map((item) => ({
              productId: item.productId,
              productName: item.product.name,
              quantity: item.quantity,
              unitPriceInCents: item.product.priceInCents,
              amountInCents: item.product.priceInCents * item.quantity
            }))
          }
        },
        include: { items: true, user: true }
      });

      if (totals.couponId) {
        await tx.coupon.update({
          where: { id: totals.couponId },
          data: { usedCount: { increment: 1 } }
        });
      }

      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
      await tx.cart.update({
        where: { id: cart.id },
        data: { couponCode: null }
      });

      return created;
    });

    const asaasCheckout = await createAsaasCheckout({
      externalReference: orderExternalReference(order.id),
      itemName: asaasCheckoutItemName(`Pedido (${order.items.length} item(ns))`),
      itemDescription: `Pedido vitrine - ${authUser.name}`,
      amountInCents: order.amountInCents,
      billingType: body.billingType as AsaasBillingType
    });

    const updatedOrder = asaasCheckout
      ? await prisma.order.update({
          where: { id: order.id },
          data: {
            asaasPaymentId: asaasCheckout.id,
            paymentUrl: asaasCheckout.url
          },
          include: { items: true, user: true }
        })
      : order;

    return reply.code(201).send({ order: updatedOrder });
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

  app.post("/student/orders/:id/checkout", async (request) => {
    requireDatabase();
    await assertModuleEnabled("module_purchases");
    const authUser = await requireAuth(app, request);
    if (isAdminStudentPreview(authUser)) {
      throw httpError(403, "Preview admin não pode pagar pedidos.");
    }
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = z
      .object({
        billingType: z.enum(["BOLETO", "CREDIT_CARD", "PIX", "UNDEFINED"]).default("UNDEFINED")
      })
      .parse(request.body ?? {});

    const order = await prisma.order.findFirst({
      where: { id, userId: authUser.id, deletedAt: null },
      include: { items: true }
    });
    if (!order) throw httpError(404, "Pedido não encontrado.");
    if (ORDER_PAID_STATUSES.includes(order.status)) {
      return { order, alreadyPaid: true };
    }
    if (order.status !== "PENDING") throw httpError(400, "Este pedido não pode mais ser pago.");
    if (order.paymentUrl) return { order, alreadyPaid: false };

    const asaasCheckout = await createAsaasCheckout({
      externalReference: orderExternalReference(order.id),
      itemName: asaasCheckoutItemName(`Pedido (${order.items.length} item(ns))`),
      itemDescription: `Pedido vitrine - ${authUser.name}`,
      amountInCents: order.amountInCents,
      billingType: body.billingType as AsaasBillingType
    });
    if (!asaasCheckout) {
      throw httpError(503, "Pagamento online indisponível. A academia confirmará o pedido manualmente.");
    }

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: {
        asaasPaymentId: asaasCheckout.id,
        paymentUrl: asaasCheckout.url,
        paymentMethod: body.billingType === "UNDEFINED" ? order.paymentMethod : body.billingType
      },
      include: { items: true }
    });

    return { order: updated, alreadyPaid: false };
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

    if (ORDER_PAID_STATUSES.includes(body.status) && !ORDER_PAID_STATUSES.includes(current.status)) {
      for (const item of current.items) {
        await decrementProductStock(item.productId, item.quantity);
      }
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
