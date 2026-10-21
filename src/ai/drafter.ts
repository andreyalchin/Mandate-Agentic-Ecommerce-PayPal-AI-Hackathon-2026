import type Anthropic from "@anthropic-ai/sdk";
import { Category, IntentMandateInput } from "../mandate/types.js";
import type { LlmClient } from "./claude.js";

const TOOL: Anthropic.Tool = {
  name: "propose_mandate",
  description: "Propose a structured spending mandate that captures exactly what the user authorized. Never widen scope beyond what they said.",
  input_schema: {
    type: "object",
    properties: {
      summary: { type: "string", description: "One plain-language sentence the user will approve, max 280 chars" },
      budget_amount: { type: "string", description: "Decimal USD, e.g. 60.00" },
      budget_period: { type: "string", enum: ["once", "week", "month"] },
      approval_above: { type: "string", description: "Single purchases above this need the user's tap. If unstated, use 25.00 or the budget if lower." },
      per_purchase_max: { type: "string", description: "Hard ceiling only if the user stated one" },
      categories: { type: "array", items: { type: "string", enum: Category.options } },
      merchants: { type: "array", items: { type: "string" }, description: "Only if the user restricted shops" },
      expires_in_days: { type: "integer", minimum: 1, maximum: 365, description: "Default 30" },
      clarifications: { type: "array", items: { type: "string" }, description: "Anything ambiguous the user should confirm" },
    },
    required: ["summary", "budget_amount", "budget_period", "approval_above", "categories", "expires_in_days"],
  },
};

export interface MandateDraft { mandate: IntentMandateInput; clarifications: string[] }

/** Natural language → mandate draft. The draft is validated by the same schema as manual input and is not saved until the user confirms. */
export async function draftMandate(llm: LlmClient, model: string, text: string, ctx: { userId: string; walletRef: string; now?: Date }): Promise<MandateDraft> {
  // Newer models reject forced tool_choice, so ask for the tool and retry once if the model answers in prose.
  const system = "You turn a person's instructions for a shopping agent into a narrow, explicit spending mandate. Always respond by calling propose_mandate exactly once. Be conservative: when unsure, choose the smaller budget and the lower approval threshold, and add a clarification.";
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: text.slice(0, 2000) }];
  let use: Anthropic.ToolUseBlock | undefined;
  for (let attempt = 0; attempt < 2 && !use; attempt++) {
    const msg = await llm.messages.create({ model, max_tokens: 1024, tools: [TOOL], tool_choice: { type: "auto" }, system, messages });
    use = msg.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === TOOL.name);
    if (!use) messages.push({ role: "assistant", content: msg.content }, { role: "user", content: "Please call propose_mandate now." });
  }
  if (!use) throw new Error("model did not propose a mandate");
  const i = use.input as any;
  const now = ctx.now ?? new Date();
  const mandate = IntentMandateInput.parse({
    userId: ctx.userId, walletRef: ctx.walletRef, summary: String(i.summary).slice(0, 280), currency: "USD",
    budget: { amount: i.budget_amount, period: i.budget_period }, approvalAbove: i.approval_above,
    perPurchaseMax: i.per_purchase_max || undefined, categories: i.categories, merchants: i.merchants?.length ? i.merchants : undefined,
    expiresAt: new Date(now.getTime() + (i.expires_in_days ?? 30) * 86400e3).toISOString(),
  });
  return { mandate, clarifications: Array.isArray(i.clarifications) ? i.clarifications : [] };
}
