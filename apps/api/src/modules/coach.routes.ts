import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth.js";
import { prisma } from "../prisma.js";
import { assertModuleEnabled, isModuleEnabled } from "./commerce.utils.js";
import { loadCoachContext } from "./coach/context.js";
import { coachReply, llmConfigured, transcribeAudio } from "./coach/llm.js";

const coachWeatherSchema = z
  .object({
    tempC: z.number(),
    label: z.string().optional(),
    code: z.number().optional()
  })
  .optional();

const chatBodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(4000)
      })
    )
    .min(1)
    .max(40),
  weather: coachWeatherSchema
});

/**
 * Attach Coach IA under one prefix. Called from student.routes and user.routes
 * so a failed extra plugin cannot leave POST /student/coach/chat unregistered.
 */
export function attachCoachRoutes(app: FastifyInstance, prefix: string) {
  app.get(`${prefix}/status`, async (request) => {
    await requireAuth(app, request);
    const enabled = await isModuleEnabled("module_ai");
    return { enabled, llm: enabled && llmConfigured(), voice: enabled && llmConfigured() };
  });

  app.post(`${prefix}/chat`, async (request, reply) => {
    const authUser = await requireAuth(app, request);
    await assertModuleEnabled("module_ai", "Coach IA desativado.");
    const body = chatBodySchema.parse(request.body);
    const ctx = await loadCoachContext(authUser.id, { weather: body.weather ?? null });
    const result = await coachReply(ctx, body.messages);
    let savedPlanId: string | undefined;
    if (result.plan) {
      const saved = await prisma.aiWorkoutPlan.create({
        data: {
          userId: authUser.id,
          objective: ctx.objective,
          level: ctx.level,
          daysPerWeek: ctx.daysPerWeek,
          focus: ctx.focus,
          plan: result.plan
        }
      });
      savedPlanId = saved.id;
    }

    return reply.send({
      reply: result.reply,
      source: result.source,
      plan: result.plan ?? null,
      diet: result.diet ?? null,
      savedPlanId: savedPlanId ?? null,
      biotype: ctx.biotype,
      streakDays: ctx.streakDays
    });
  });

  app.post(`${prefix}/transcribe`, async (request, reply) => {
    await requireAuth(app, request);
    await assertModuleEnabled("module_ai", "Coach IA desativado.");
    if (!llmConfigured()) {
      return reply.code(501).send({
        error:
          "Transcrição de voz precisa de OPENAI_API_KEY (Whisper). Enquanto isso, fale pelo teclado — o TTS já responde."
      });
    }
    const file = await request.file({ limits: { fileSize: 12 * 1024 * 1024, files: 1 } });
    if (!file) {
      return reply.code(400).send({ error: "Envie um áudio." });
    }
    const chunks: Buffer[] = [];
    for await (const chunk of file.file) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const text = await transcribeAudio(Buffer.concat(chunks), file.filename || "audio.m4a", file.mimetype);
    if (!text) {
      return reply.code(422).send({
        error: "Não deu para transcrever. Tente de novo em um lugar mais silencioso."
      });
    }
    return { text };
  });
}

export async function registerCoachRoutes(app: FastifyInstance) {
  attachCoachRoutes(app, "/student/coach");
  attachCoachRoutes(app, "/user/coach");
}
