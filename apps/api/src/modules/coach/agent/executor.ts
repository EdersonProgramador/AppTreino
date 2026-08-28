import { localCoachChat } from "../engine.js";
import { llmConfigured, openaiCoach, systemPrompt, coachMessageText, type CoachLlmMessage } from "../llm.js";
import type { AgentPlan, AgentTrace, CoachChatResult, CoachContext, CoachMessage, DietPlan } from "../types.js";
import { MAX_REACT_ITERATIONS, MAX_TOOL_CALLS } from "./guardrails.js";
import { logTrace } from "./observability.js";
import { type Perception, perceptionSystemBlock } from "./perceive.js";
import { executeTool } from "./toolbox.js";

export type Execution = {
  result: CoachChatResult;
  traces: AgentTrace[];
  iterations: number;
  toolCalls: number;
};

function historyForModel(history: CoachMessage[], perception: Perception): CoachLlmMessage[] {
  const mapped: CoachLlmMessage[] = history.map((item) => ({
    role: item.role === "assistant" ? ("assistant" as const) : ("user" as const),
    content: item.content
  }));
  for (let i = mapped.length - 1; i >= 0; i -= 1) {
    if (mapped[i]?.role === "user") {
      mapped[i] = {
        role: "user",
        content: `${perceptionSystemBlock(perception)}\n\nMensagem do aluno (responda isto, não um menu):\n${mapped[i]?.content ?? ""}`
      };
      break;
    }
  }
  return mapped;
}

function mergeTool(current: CoachChatResult, outcome: ReturnType<typeof executeTool>): CoachChatResult {
  return {
    ...current,
    plan: outcome.plan ?? current.plan,
    diet: (outcome.diet ?? current.diet) as DietPlan | undefined
  };
}

export async function executePlan(
  ctx: CoachContext,
  history: CoachMessage[],
  plan: AgentPlan,
  memoryBlock: string,
  perception: Perception
): Promise<Execution> {
  const traces: AgentTrace[] = [];
  logTrace(traces, "reasoning", {
    thought: `${plan.kind} via ${plan.pattern} | ${perception.question.slice(0, 160)}`,
    action: plan.steps.join(",") || "responder"
  });

  if (plan.pattern === "plan-execute" && plan.steps.length) {
    return executeStructured(ctx, history, plan, memoryBlock, perception, traces);
  }
  return executeReact(ctx, history, plan, memoryBlock, perception, traces);
}

async function executeStructured(
  ctx: CoachContext,
  history: CoachMessage[],
  plan: AgentPlan,
  memoryBlock: string,
  perception: Perception,
  traces: AgentTrace[]
): Promise<Execution> {
  let result: CoachChatResult = { reply: "", source: llmConfigured() ? "llm" : "local" };
  let toolCalls = 0;
  const observations: string[] = [];
  for (const name of plan.steps.slice(0, MAX_TOOL_CALLS)) {
    const outcome = executeTool(name, "{}", ctx);
    toolCalls += 1;
    result = mergeTool(result, outcome);
    observations.push(outcome.observation);
    logTrace(traces, "action", { action: name, observation: outcome.observation.slice(0, 400) });
  }
  if (llmConfigured()) {
    const spoken = await openaiCoach(
      [
        { role: "system", content: systemPrompt(ctx, memoryBlock) },
        ...historyForModel(history, perception),
        {
          role: "system",
          content: `Resultado das tools. Responda a pergunta atual, começando pelo que vale HOJE.\n${observations.join("\n").slice(0, 4000)}`
        }
      ],
      false
    );
    const reply = coachMessageText(spoken?.choices?.[0]?.message);
    if (reply) {
      return { result: { ...result, reply, source: "llm" }, traces, iterations: 1, toolCalls };
    }
  }
  const local = localCoachChat(ctx, history);
  return {
    result: { ...local, plan: result.plan ?? local.plan, diet: result.diet ?? local.diet },
    traces,
    iterations: 1,
    toolCalls
  };
}

async function executeReact(
  ctx: CoachContext,
  history: CoachMessage[],
  plan: AgentPlan,
  memoryBlock: string,
  perception: Perception,
  traces: AgentTrace[]
): Promise<Execution> {
  if (!llmConfigured()) {
    const local = localCoachChat(ctx, history);
    if (plan.steps.length) {
      let next = local;
      for (const name of plan.steps.slice(0, MAX_TOOL_CALLS)) {
        next = mergeTool(next, executeTool(name, "{}", ctx));
        logTrace(traces, "action", { action: name, observation: "local-tool" });
      }
      return { result: next, traces, iterations: 1, toolCalls: plan.steps.length };
    }
    return { result: local, traces, iterations: 1, toolCalls: 0 };
  }

  const messages: CoachLlmMessage[] = [
    { role: "system", content: systemPrompt(ctx, memoryBlock) },
    ...historyForModel(history, perception)
  ];

  let result: CoachChatResult = { reply: "", source: "llm" };
  let toolCalls = 0;
  let iterations = 0;

  for (let i = 0; i < MAX_REACT_ITERATIONS; i += 1) {
    iterations = i + 1;
    const round = await openaiCoach(messages, plan.useTools && toolCalls < MAX_TOOL_CALLS);
    const message = round?.choices?.[0]?.message;
    if (!message) break;

    if (!message.tool_calls?.length) {
      const reply = coachMessageText(message);
      if (reply) result = { ...result, reply };
      logTrace(traces, "reasoning", { thought: "resposta final sem tool" });
      break;
    }

    messages.push(message);
    for (const call of message.tool_calls) {
      if (toolCalls >= MAX_TOOL_CALLS) {
        logTrace(traces, "action", { action: call.function.name, observation: "cap de tools" });
        messages.push({ role: "tool", tool_call_id: call.id, content: "{\"error\":\"limite de tools\"}" });
        continue;
      }
      const outcome = executeTool(call.function.name, call.function.arguments, ctx);
      toolCalls += 1;
      result = mergeTool(result, outcome);
      messages.push({ role: "tool", tool_call_id: call.id, content: outcome.observation });
      logTrace(traces, "action", {
        action: call.function.name,
        observation: outcome.observation.slice(0, 400)
      });
    }
  }

  if (!result.reply) {
    const local = localCoachChat(ctx, history);
    result = { ...local, plan: result.plan ?? local.plan, diet: result.diet ?? local.diet };
  }
  return { result, traces, iterations, toolCalls };
}
