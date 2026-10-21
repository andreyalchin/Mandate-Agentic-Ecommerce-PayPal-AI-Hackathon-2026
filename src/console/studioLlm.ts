import type Anthropic from "@anthropic-ai/sdk";
import { Router } from "express";
import type { Llm } from "../server/mandateRoutes.js";
import { liveRows, simulatedRows } from "./rows.js";
import type { MandateService } from "../mandate/service.js";

/**
 * Claude for AG Studio's Agent Framework. The browser adapter posts AG Studio's turn request
 * (AgLlmRequest: conversation items, tools, tool choice, response format) here; we translate it
 * to the Anthropic Messages API and translate the reply back to AG Studio output items.
 * The key stays on the server; the model, token cap and rate limit are fixed here.
 */
type Item = any;

export function toAnthropic(req: { input: Item[]; instructions?: string; tools?: any[]; toolChoice?: any; responseFormat?: any }) {
  const system: string[] = [];
  if (req.instructions) system.push(req.instructions);
  const messages: Anthropic.MessageParam[] = [];
  const push = (role: "user" | "assistant", block: Anthropic.ContentBlockParam) => {
    const last = messages.at(-1);
    if (last && last.role === role) (last.content as Anthropic.ContentBlockParam[]).push(block);
    else messages.push({ role, content: [block] });
  };
  for (const it of req.input ?? []) {
    if (it.type === "message" && it.kind === "input") {
      const text = (it.content ?? []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n");
      if (!text) continue;
      if (it.role === "system") system.push(text); else push("user", { type: "text", text });
    } else if (it.type === "message" && it.kind === "output") {
      const text = (it.content ?? []).map((c: any) => (c.type === "text" ? c.text : c.refusal ?? "")).join("");
      if (text) push("assistant", { type: "text", text });
    } else if (it.type === "function_call") {
      let input: unknown = {}; try { input = it.arguments ? JSON.parse(it.arguments) : {}; } catch { input = {}; }
      push("assistant", { type: "tool_use", id: it.callId, name: it.name, input });
    } else if (it.type === "function_call_output") {
      push("user", { type: "tool_result", tool_use_id: it.callId, content: String(it.output ?? "") });
    } // reasoning items are not replayed
  }
  if (messages[0]?.role !== "user") messages.unshift({ role: "user", content: [{ type: "text", text: "Continue." }] });
  // Claude rejects assistant prefill: the conversation must end on a user turn. AG Studio's agent loop
  // sometimes re-enters after an assistant text reply (for example after a sub-agent completes).
  if (messages.at(-1)?.role === "assistant") messages.push({ role: "user", content: [{ type: "text", text: "Continue with the task. If it is complete, give your final answer." }] });
  // Sonnet 5.5 rejects forced tool_choice ("any"/"tool"), so a required or named tool becomes an instruction.
  const tc = req.toolChoice;
  if (tc === "required") system.push("You must call at least one tool in this turn.");
  else if (tc && typeof tc === "object" && tc.name) system.push(`You must call the tool "${tc.name}" in this turn.`);
  if (req.responseFormat?.type === "json") system.push(`Reply with only a JSON value (no prose, no code fences) matching this JSON Schema named "${req.responseFormat.name}":\n${JSON.stringify(req.responseFormat.schema)}`);
  const tools: Anthropic.Tool[] = tc === "none" ? [] : (req.tools ?? []).map((t: any) => ({ name: t.name, description: (t.description ?? "").slice(0, 4000), input_schema: { type: "object", ...(t.parameters ?? {}) } as any }));
  return { system: system.join("\n\n"), messages, tools };
}

export function fromAnthropic(msg: Anthropic.Message, json: boolean) {
  const output: Item[] = [];
  let i = 0;
  for (const b of msg.content) {
    if (b.type === "text") {
      let text = b.text;
      if (json) text = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
      output.push({ id: `${msg.id}_m${i++}`, kind: "output", type: "message", role: "assistant", status: "completed", content: [{ type: "text", text, annotations: [] }] });
    } else if (b.type === "tool_use") {
      output.push({ id: `${msg.id}_t${i++}`, kind: "output", type: "function_call", callId: b.id, name: b.name, arguments: JSON.stringify(b.input ?? {}), status: "completed" });
    }
  }
  return {
    id: msg.id, createdAt: Date.now(), model: msg.model, output,
    status: msg.stop_reason === "max_tokens" ? "incomplete" : "completed",
    incompleteDetails: msg.stop_reason === "max_tokens" ? { reason: "max_output_tokens" } : undefined,
    usage: { inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens, totalTokens: msg.usage.input_tokens + msg.usage.output_tokens },
  };
}

/** Tiny fixed-window limiter, per client IP. */
function limiter(perMinute: number) {
  const hits = new Map<string, { n: number; at: number }>();
  return (ip: string) => { const now = Date.now(); const h = hits.get(ip); if (!h || now - h.at > 60_000) { hits.set(ip, { n: 1, at: now }); return true; } return ++h.n <= perMinute; };
}

export function consoleRoutes(svc: MandateService, llm?: Llm) {
  const r = Router(); const allow = limiter(40);
  r.get("/api/console/data", (q, s) => {
    const live = liveRows(svc); const sim = q.query.simulated === "0" ? { attempts: [], mandates: [] } : simulatedRows();
    s.json({ asOf: new Date().toISOString(), attempts: [...sim.attempts, ...live.attempts].sort((a, b) => a.at.localeCompare(b.at)), mandates: [...sim.mandates, ...live.mandates] });
  });
  r.post("/api/studio/turn", async (q, s, next) => {
    try {
      if (!llm) { s.status(503).json({ error: "UNAVAILABLE", message: "AI not configured" }); return; }
      if (!allow(q.ip ?? "?")) { s.status(429).json({ error: "RATE_LIMITED", message: "Too many AI requests; wait a minute." }); return; }
      const body = q.body ?? {};
      const size = JSON.stringify(body).length;
      if (!Array.isArray(body.input) || size > 400_000) { console.warn(`[studio] rejected turn: ${Array.isArray(body.input) ? `body ${size} bytes` : "no input"}`); s.status(400).json({ error: "BAD_REQUEST", message: "Request too large" }); return; }
      const { system, messages, tools } = toAnthropic(body);
      const msg = await llm.client.messages.create({ model: await llm.model(), max_tokens: 4096, system, messages, tools: tools.length ? tools : undefined });
      s.json(fromAnthropic(msg, body.responseFormat?.type === "json"));
    } catch (e: any) { console.warn(`[studio] turn failed: ${e?.status ?? ""} ${String(e?.message ?? e).slice(0, 400)}`); next(e); }
  });
  return r;
}
