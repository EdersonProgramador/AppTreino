import { lastUserText } from "../engine.js";
import type { AgentTrace, CoachChatResult, CoachContext, CoachMessage } from "../types.js";
import { stitchContext } from "./context.js";
import { executePlan } from "./executor.js";
import { autonomyCap, inspectGuardrails } from "./guardrails.js";
import { remember, retrieveMemories } from "./memory.js";
import { logAgentRun, logTrace, tooManyRuns } from "./observability.js";
import { planTurn } from "./planner.js";
import { reflectOnReply } from "./reflect.js";

/**
 * Agent loop: percepção → raciocínio → ação → feedback.
 * Estrutura: planner, executor, memory store, toolbox.
 */
export async function runCoachAgent(
  ctx: CoachContext,
  history: CoachMessage[],
  extras?: { userId?: string }
): Promise<CoachChatResult> {
  const userId = extras?.userId;
  const traces: AgentTrace[] = [];
  const userText = lastUserText(history);

  logTrace(traces, "perception", { thought: userText.slice(0, 240) });

  if (userId && (await tooManyRuns(userId))) {
    const reply =
      "Calma — muita mensagem em pouco tempo. Espera um minuto e a gente continua. Isso evita loop e gasto à toa da API.";
    const runId = await persist(userId, traces, {
      kind: "interactive",
      pattern: "reflect",
      blocked: true,
      reason: "rate_limit",
      reply,
      iterations: 0,
      toolCalls: 0,
      actions: []
    });
    return {
      reply,
      source: "local",
      agent: { kind: "interactive", pattern: "reflect", iterations: 0, toolCalls: 0, runId, blocked: true }
    };
  }

  const guard = inspectGuardrails(userText);
  if (guard) {
    logTrace(traces, "feedback", { thought: `guardrail:${guard.reason}` });
    const runId = userId
      ? await persist(userId, traces, {
          kind: "interactive",
          pattern: "reflect",
          blocked: true,
          reason: guard.reason,
          reply: guard.reply,
          iterations: 0,
          toolCalls: 0,
          actions: []
        })
      : undefined;
    return {
      reply: guard.reply,
      source: "local",
      agent: { kind: "interactive", pattern: "reflect", iterations: 0, toolCalls: 0, runId, blocked: true }
    };
  }

  const memories = userId ? await retrieveMemories(userId, userText) : [];
  const stitched = stitchContext(history, memories);
  logTrace(traces, "perception", {
    thought: `contexto: ${stitched.history.length} msgs; memória ${memories.length} trechos`
  });

  const planned = autonomyCap(planTurn(stitched.history));
  logTrace(traces, "reasoning", {
    thought: `planner ${planned.kind}/${planned.pattern}`,
    action: planned.steps.join(",") || "chat"
  });

  const executed = await executePlan(ctx, stitched.history, planned, stitched.memoryBlock);
  traces.push(...executed.traces);

  const reflected = reflectOnReply(executed.result.reply, userText, planned);
  logTrace(traces, "feedback", {
    thought: reflected.ok ? "ok" : reflected.notes.join("; "),
    observation: reflected.reply.slice(0, 200)
  });

  const persistPlan = planned.persistPlan ? executed.result.plan : undefined;
  const result: CoachChatResult = {
    ...executed.result,
    reply: reflected.reply,
    plan: persistPlan,
    agent: {
      kind: planned.kind,
      pattern: planned.pattern,
      iterations: executed.iterations,
      toolCalls: executed.toolCalls,
      blocked: false
    }
  };

  if (userId) {
    const runId = await persist(userId, traces, {
      kind: planned.kind,
      pattern: planned.pattern,
      blocked: false,
      reply: result.reply,
      iterations: executed.iterations,
      toolCalls: executed.toolCalls,
      actions: planned.steps
    });
    if (runId) result.agent = { ...result.agent!, runId };
    await remember(userId, "EPISODIC", `${userText.slice(0, 180)} → ${result.reply.slice(0, 280)}`, {
      kind: planned.kind,
      pattern: planned.pattern
    });
    if (planned.kind === "goal" || planned.kind === "autonomous") {
      await remember(userId, "LONG_TERM", `Objetivo ativo: ${ctx.objective}. Nível ${ctx.level}.`, {
        source: "profile"
      });
    }
  }

  return result;
}

async function persist(
  userId: string,
  traces: AgentTrace[],
  info: {
    kind: string;
    pattern: string;
    blocked: boolean;
    reason?: string;
    reply: string;
    iterations: number;
    toolCalls: number;
    actions: string[];
  }
) {
  return logAgentRun({
    userId,
    agentKind: info.kind,
    pattern: info.pattern,
    perception: { user: traces.find((item) => item.phase === "perception")?.thought },
    traces,
    actions: info.actions,
    feedback: { blocked: info.blocked, reason: info.reason ?? null },
    iterations: info.iterations,
    toolCalls: info.toolCalls,
    blocked: info.blocked,
    blockReason: info.reason ?? null,
    reply: info.reply
  });
}
