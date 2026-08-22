import { Router } from "express";
import { prisma } from "../../config";
import { verifyToken } from "../../middleware";
import { fail, getCurrentUser } from "../../shared";
import { ensureFitnessSeed } from "./fitness.seed";

const fitness = Router();
fitness.use(verifyToken);

async function boot() {
  await ensureFitnessSeed();
}

function money(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

fitness.get("/home", async (request, response) => {
  try {
    await boot();
    const me = getCurrentUser(request).id;
    const [programs, challenges, products, recentLogs, activity] = await Promise.all([
      prisma.trainingProgram.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, take: 6 }),
      prisma.clubChallenge.findMany({ where: { isActive: true }, take: 4 }),
      prisma.shopProduct.findMany({ where: { isActive: true }, take: 4 }),
      prisma.workoutLog.findMany({
        where: { userId: me },
        orderBy: { startedAt: "desc" },
        take: 5,
        include: { workout: { select: { title: true } } }
      }),
      prisma.outdoorActivity.findFirst({
        where: { userId: me, status: "LIVE" },
        orderBy: { startedAt: "desc" }
      })
    ]);
    return response.json({
      success: true,
      programs,
      challenges,
      products: products.map(p => ({ ...p, priceLabel: money(p.priceCents) })),
      recentLogs,
      liveActivity: activity
    });
  } catch (error) {
    return fail(response, 500, error instanceof Error ? error.message : "Erro interno.");
  }
});

fitness.get("/programs", async (_request, response) => {
  try {
    await boot();
    const programs = await prisma.trainingProgram.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      include: { _count: { select: { workouts: true } } }
    });
    return response.json({ success: true, programs });
  } catch (error) {
    return fail(response, 500, error instanceof Error ? error.message : "Erro interno.");
  }
});

fitness.get("/programs/:id", async (request, response) => {
  try {
    await boot();
    const program = await prisma.trainingProgram.findUnique({
      where: { id: String(request.params.id) },
      include: {
        workouts: {
          orderBy: { dayIndex: "asc" },
          include: { exercises: { orderBy: { sortOrder: "asc" } } }
        }
      }
    });
    if (!program) return response.status(404).json({ success: false, message: "Programa não encontrado." });
    return response.json({ success: true, program });
  } catch (error) {
    return fail(response, 500, error instanceof Error ? error.message : "Erro interno.");
  }
});

fitness.get("/workouts/:id", async (request, response) => {
  try {
    const workout = await prisma.trainingWorkout.findUnique({
      where: { id: String(request.params.id) },
      include: {
        exercises: { orderBy: { sortOrder: "asc" } },
        program: { select: { id: true, title: true, modality: true } }
      }
    });
    if (!workout) return response.status(404).json({ success: false, message: "Treino não encontrado." });
    return response.json({ success: true, workout });
  } catch (error) {
    return fail(response, 500, error instanceof Error ? error.message : "Erro interno.");
  }
});

fitness.post("/workouts/:id/complete", async (request, response) => {
  try {
    const me = getCurrentUser(request).id;
    const workoutId = String(request.params.id);
    const workout = await prisma.trainingWorkout.findUnique({ where: { id: workoutId } });
    if (!workout) return response.status(404).json({ success: false, message: "Treino não encontrado." });
    const durationSec = Number(request.body?.durationSec) || workout.durationMin * 60;
    const log = await prisma.workoutLog.create({
      data: {
        userId: me,
        workoutId,
        status: "completed",
        finishedAt: new Date(),
        durationSec,
        notes: typeof request.body?.notes === "string" ? request.body.notes.slice(0, 300) : undefined
      },
      include: { workout: { select: { title: true } } }
    });
    return response.json({ success: true, log });
  } catch (error) {
    return fail(response, 500, error instanceof Error ? error.message : "Erro interno.");
  }
});

fitness.get("/history", async (request, response) => {
  try {
    const me = getCurrentUser(request).id;
    const logs = await prisma.workoutLog.findMany({
      where: { userId: me },
      orderBy: { startedAt: "desc" },
      take: 40,
      include: {
        workout: {
          select: { title: true, focus: true, program: { select: { title: true, modality: true } } }
        }
      }
    });
    return response.json({ success: true, logs });
  } catch (error) {
    return fail(response, 500, error instanceof Error ? error.message : "Erro interno.");
  }
});

fitness.get("/activities", async (request, response) => {
  try {
    const me = getCurrentUser(request).id;
    const activities = await prisma.outdoorActivity.findMany({
      where: { userId: me },
      orderBy: { startedAt: "desc" },
      take: 30
    });
    return response.json({ success: true, activities });
  } catch (error) {
    return fail(response, 500, error instanceof Error ? error.message : "Erro interno.");
  }
});

fitness.post("/activities/start", async (request, response) => {
  try {
    const me = getCurrentUser(request).id;
    const sport = String(request.body?.sport || "CORRIDA").toUpperCase();
    await prisma.outdoorActivity.updateMany({
      where: { userId: me, status: "LIVE" },
      data: { status: "CANCELLED", finishedAt: new Date() }
    });
    const activity = await prisma.outdoorActivity.create({
      data: { userId: me, sport, status: "LIVE" }
    });
    return response.json({ success: true, activity });
  } catch (error) {
    return fail(response, 500, error instanceof Error ? error.message : "Erro interno.");
  }
});

fitness.post("/activities/:id/finish", async (request, response) => {
  try {
    const me = getCurrentUser(request).id;
    const id = String(request.params.id);
    const existing = await prisma.outdoorActivity.findFirst({ where: { id, userId: me } });
    if (!existing) return response.status(404).json({ success: false, message: "Atividade não encontrada." });

    const distanceMeters = Number(request.body?.distanceMeters) || existing.distanceMeters;
    const elapsedSeconds =
      Number(request.body?.elapsedSeconds) ||
      Math.max(1, Math.floor((Date.now() - existing.startedAt.getTime()) / 1000));
    const calories = Number(request.body?.calories) || Math.round((distanceMeters / 1000) * 60);
    const avgPaceSecPerKm = distanceMeters > 0 ? elapsedSeconds / (distanceMeters / 1000) : null;
    const publish = request.body?.publish !== false;

    const activity = await prisma.outdoorActivity.update({
      where: { id },
      data: {
        status: "FINISHED",
        finishedAt: new Date(),
        distanceMeters,
        elapsedSeconds,
        calories,
        avgPaceSecPerKm,
        publishToFeed: publish,
        notes: typeof request.body?.notes === "string" ? request.body.notes.slice(0, 300) : existing.notes
      }
    });

    if (publish) {
      const km = (distanceMeters / 1000).toFixed(2);
      const mins = Math.floor(elapsedSeconds / 60);
      await prisma.post.create({
        data: {
          content: `Finalizei ${activity.sport.toLowerCase()}: ${km} km em ${mins} min · ${calories} kcal`,
          created_on: new Date().toISOString(),
          fk_user_id: me
        }
      });
    }

    return response.json({ success: true, activity });
  } catch (error) {
    return fail(response, 500, error instanceof Error ? error.message : "Erro interno.");
  }
});

fitness.get("/club", async (request, response) => {
  try {
    await boot();
    const me = getCurrentUser(request).id;
    const challenges = await prisma.clubChallenge.findMany({
      where: { isActive: true },
      include: {
        memberships: { where: { userId: me } },
        _count: { select: { memberships: true } }
      }
    });
    return response.json({
      success: true,
      challenges: challenges.map(row => ({
        id: row.id,
        slug: row.slug,
        title: row.title,
        description: row.description,
        sport: row.sport,
        goalMeters: row.goalMeters,
        period: row.period,
        joined: row.memberships.length > 0,
        myProgressM: row.memberships[0]?.progressM ?? 0,
        members: row._count.memberships
      }))
    });
  } catch (error) {
    return fail(response, 500, error instanceof Error ? error.message : "Erro interno.");
  }
});

fitness.post("/club/:id/join", async (request, response) => {
  try {
    const me = getCurrentUser(request).id;
    const challengeId = String(request.params.id);
    const membership = await prisma.clubMembership.upsert({
      where: { userId_challengeId: { userId: me, challengeId } },
      create: { userId: me, challengeId },
      update: {}
    });
    return response.json({ success: true, membership });
  } catch (error) {
    return fail(response, 500, error instanceof Error ? error.message : "Erro interno.");
  }
});

fitness.get("/shop/products", async (_request, response) => {
  try {
    await boot();
    const products = await prisma.shopProduct.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" }
    });
    return response.json({
      success: true,
      products: products.map(p => ({ ...p, priceLabel: money(p.priceCents) }))
    });
  } catch (error) {
    return fail(response, 500, error instanceof Error ? error.message : "Erro interno.");
  }
});

fitness.get("/shop/cart", async (request, response) => {
  try {
    const me = getCurrentUser(request).id;
    const items = await prisma.shopCartItem.findMany({
      where: { userId: me },
      include: { product: true }
    });
    const totalCents = items.reduce((sum, item) => sum + item.qty * item.product.priceCents, 0);
    return response.json({
      success: true,
      items: items.map(item => ({
        id: item.id,
        qty: item.qty,
        product: { ...item.product, priceLabel: money(item.product.priceCents) }
      })),
      totalCents,
      totalLabel: money(totalCents)
    });
  } catch (error) {
    return fail(response, 500, error instanceof Error ? error.message : "Erro interno.");
  }
});

fitness.post("/shop/cart", async (request, response) => {
  try {
    const me = getCurrentUser(request).id;
    const productId = String(request.body?.productId || "");
    const qty = Math.max(1, Number(request.body?.qty) || 1);
    const product = await prisma.shopProduct.findUnique({ where: { id: productId } });
    if (!product) return response.status(404).json({ success: false, message: "Produto não encontrado." });
    const item = await prisma.shopCartItem.upsert({
      where: { userId_productId: { userId: me, productId } },
      create: { userId: me, productId, qty },
      update: { qty: { increment: qty } }
    });
    return response.json({ success: true, item });
  } catch (error) {
    return fail(response, 500, error instanceof Error ? error.message : "Erro interno.");
  }
});

fitness.post("/shop/checkout", async (request, response) => {
  try {
    const me = getCurrentUser(request).id;
    const cart = await prisma.shopCartItem.findMany({
      where: { userId: me },
      include: { product: true }
    });
    if (!cart.length) return response.status(400).json({ success: false, message: "Carrinho vazio." });
    const totalCents = cart.reduce((sum, item) => sum + item.qty * item.product.priceCents, 0);
    const order = await prisma.$transaction(async tx => {
      const created = await tx.shopOrder.create({
        data: {
          userId: me,
          status: "PAID",
          totalCents,
          items: {
            create: cart.map(item => ({
              productId: item.productId,
              qty: item.qty,
              priceCents: item.product.priceCents
            }))
          }
        },
        include: { items: { include: { product: true } } }
      });
      await tx.shopCartItem.deleteMany({ where: { userId: me } });
      return created;
    });
    return response.json({ success: true, order: { ...order, totalLabel: money(order.totalCents) } });
  } catch (error) {
    return fail(response, 500, error instanceof Error ? error.message : "Erro interno.");
  }
});

fitness.get("/shop/orders", async (request, response) => {
  try {
    const me = getCurrentUser(request).id;
    const orders = await prisma.shopOrder.findMany({
      where: { userId: me },
      orderBy: { createdAt: "desc" },
      include: { items: { include: { product: true } } }
    });
    return response.json({
      success: true,
      orders: orders.map(o => ({ ...o, totalLabel: money(o.totalCents) }))
    });
  } catch (error) {
    return fail(response, 500, error instanceof Error ? error.message : "Erro interno.");
  }
});

fitness.get("/assessments", async (request, response) => {
  try {
    const me = getCurrentUser(request).id;
    const assessments = await prisma.physicalAssessment.findMany({
      where: { userId: me },
      orderBy: { createdAt: "desc" }
    });
    return response.json({ success: true, assessments });
  } catch (error) {
    return fail(response, 500, error instanceof Error ? error.message : "Erro interno.");
  }
});

fitness.post("/assessments", async (request, response) => {
  try {
    const me = getCurrentUser(request).id;
    const assessment = await prisma.physicalAssessment.create({
      data: {
        userId: me,
        weightKg: request.body?.weightKg != null ? Number(request.body.weightKg) : undefined,
        heightCm: request.body?.heightCm != null ? Number(request.body.heightCm) : undefined,
        bodyFatPct: request.body?.bodyFatPct != null ? Number(request.body.bodyFatPct) : undefined,
        notes: typeof request.body?.notes === "string" ? request.body.notes.slice(0, 400) : undefined
      }
    });
    return response.json({ success: true, assessment });
  } catch (error) {
    return fail(response, 500, error instanceof Error ? error.message : "Erro interno.");
  }
});

fitness.get("/play", async (_request, response) => {
  try {
    await boot();
    const albums = await prisma.musicAlbum.findMany({
      include: { tracks: { orderBy: { sortOrder: "asc" } } }
    });
    return response.json({ success: true, albums });
  } catch (error) {
    return fail(response, 500, error instanceof Error ? error.message : "Erro interno.");
  }
});

fitness.get("/locations", async (_request, response) => {
  try {
    await boot();
    const locations = await prisma.gymLocation.findMany({ where: { isActive: true } });
    return response.json({ success: true, locations });
  } catch (error) {
    return fail(response, 500, error instanceof Error ? error.message : "Erro interno.");
  }
});

fitness.get("/events", async (request, response) => {
  try {
    await boot();
    const me = getCurrentUser(request).id;
    const events = await prisma.fitnessEvent.findMany({
      orderBy: { startsAt: "asc" },
      include: {
        regs: { where: { userId: me } },
        _count: { select: { regs: true } }
      }
    });
    return response.json({
      success: true,
      events: events.map(e => ({
        id: e.id,
        title: e.title,
        description: e.description,
        startsAt: e.startsAt,
        location: e.location,
        capacity: e.capacity,
        joined: e.regs.length > 0,
        seats: e._count.regs
      }))
    });
  } catch (error) {
    return fail(response, 500, error instanceof Error ? error.message : "Erro interno.");
  }
});

fitness.post("/events/:id/join", async (request, response) => {
  try {
    const me = getCurrentUser(request).id;
    const eventId = String(request.params.id);
    const reg = await prisma.eventRegistration.upsert({
      where: { eventId_userId: { eventId, userId: me } },
      create: { eventId, userId: me },
      update: {}
    });
    return response.json({ success: true, reg });
  } catch (error) {
    return fail(response, 500, error instanceof Error ? error.message : "Erro interno.");
  }
});

fitness.get("/support", async (request, response) => {
  try {
    const me = getCurrentUser(request).id;
    const tickets = await prisma.supportTicket.findMany({
      where: { userId: me },
      orderBy: { createdAt: "desc" }
    });
    return response.json({ success: true, tickets });
  } catch (error) {
    return fail(response, 500, error instanceof Error ? error.message : "Erro interno.");
  }
});

fitness.post("/support", async (request, response) => {
  try {
    const me = getCurrentUser(request).id;
    const subject = String(request.body?.subject || "").trim().slice(0, 120);
    const body = String(request.body?.body || "").trim().slice(0, 1000);
    if (subject.length < 3 || body.length < 5) {
      return response.status(400).json({ success: false, message: "Preencha assunto e mensagem." });
    }
    const ticket = await prisma.supportTicket.create({
      data: { userId: me, subject, body }
    });
    return response.json({ success: true, ticket });
  } catch (error) {
    return fail(response, 500, error instanceof Error ? error.message : "Erro interno.");
  }
});

fitness.get("/membership", async (request, response) => {
  try {
    const me = getCurrentUser(request);
    return response.json({
      success: true,
      membership: {
        plan: "Treino Social",
        status: "ACTIVE",
        user: { id: me.id, email: me.email },
        renewsAt: null,
        benefits: ["Feed social", "Programas de treino", "Clube e desafios", "Atividade outdoor", "Play e vitrine"]
      }
    });
  } catch (error) {
    return fail(response, 500, error instanceof Error ? error.message : "Erro interno.");
  }
});

fitness.get("/ai-plan", async (_request, response) => {
  try {
    await boot();
    const program = await prisma.trainingProgram.findFirst({
      where: { isActive: true },
      include: { workouts: { take: 3, orderBy: { dayIndex: "asc" } } }
    });
    return response.json({
      success: true,
      plan: {
        title: "Plano inteligente da semana",
        summary: "Sugestão baseada nos programas ativos do catálogo.",
        focus: program?.modality || "Condicionamento",
        sessions: program?.workouts.map(w => ({ id: w.id, title: w.title, focus: w.focus })) || []
      }
    });
  } catch (error) {
    return fail(response, 500, error instanceof Error ? error.message : "Erro interno.");
  }
});

export { fitness };
