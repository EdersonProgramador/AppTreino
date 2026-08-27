import { prisma } from "../../../prisma.js";
import { MAX_RUNS_PER_10_MIN } from "./guardrails.js";
import type { AgentTrace } from "../types.js";

type RunInput = {
  userId: string;
  agentKind: string;
  pattern: string;
  perception: unknown;
  traces: AgentTrace[];
  actions: unknown;
  feedback: unknown;
  iterations: number;
  toolCalls: number;
  blocked: boolean;
  blockReason?: string | null;
  reply: string;
};

function runs() {
  const client = prisma as unknown as {
    coachAgentRun?: {
      count: (args: object) => Promise<number>;
      create: (args: object) => Promise<{ id: string }>;
      findMany: (args: object) => Promise<unknown[]>;
    };
  };
  return client.coachAgentRun;
}

export async function tooManyRuns(userId: string) {
  try {
    const store = runs();
    if (!store) return false;
    const since = new Date(Date.now() - 10 * 60 * 1000);
    const count = await store.count({
      where: { userId, createdAt: { gte: since } }
    });
    return count >= MAX_RUNS_PER_10_MIN;
  } catch {
    return false;
  }
}

export async function logAgentRun(input: RunInput) {
  try {
    const store = runs();
    if (!store) return undefined;
    const row = await store.create({
      data: {
        userId: input.userId,
        agentKind: input.agentKind,
        pattern: input.pattern,
        perception: input.perception as object,
        traces: input.traces,
        actions: input.actions as object,
        feedback: input.feedback as object,
        iterations: input.iterations,
        toolCalls: input.toolCalls,
        blocked: input.blocked,
        blockReason: input.blockReason ?? null,
        replyPreview: input.reply.slice(0, 280)
      }
    });
    return row.id;
  } catch (caught) {
    console.warn("[coach/agent] log failed", caught instanceof Error ? caught.message : caught);
    return undefined;
  }
}

export function logTrace(traces: AgentTrace[], phase: AgentTrace["phase"], extra: Omit<AgentTrace, "phase">) {
  traces.push({ phase, ...extra });
}
