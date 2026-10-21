// AG Studio Agent Framework setup, all on Claude. A custom "Mandate auditor" is the primary agent:
// it reads mandates and attempt data, recommends tighter or looser rules, and delegates any
// dashboard building to AG Studio's built-in lead agent (which runs AG's specialist agents).
import { createAiHarness, directLlmRunner, type AgAiHarnessSetup, type AgAiTool } from "ag-studio";
import { claudeAdapter } from "./claudeAdapter";

const tool = (name: string, description: string, parameters: any, run: (args: any) => Promise<string>): AgAiTool => ({
  name, description, kind: "client",
  schema: () => ({ name, description, parameters }),
  async execute(call, ctx) { try { return ctx.success(await run(call.args ?? {})); } catch (e: any) { return ctx.error(e?.message ?? String(e)); } },
});

const getMandates = tool("get_mandates", "List the person's spending mandates with their rules and current-period usage (live and simulated).", { type: "object", properties: {}, additionalProperties: false }, async () => {
  const d = await (await fetch("/api/console/data")).json();
  const live = await (await fetch("/api/mandates")).json().catch(() => []);
  const states = await Promise.all(live.map((m: any) => fetch(`/api/mandates/${m.id}/state`).then((r) => r.json()).catch(() => null)));
  return JSON.stringify({
    live: states.filter(Boolean).map((s: any) => ({ id: s.mandate.id, summary: s.mandate.summary, status: s.mandate.status, budget: s.mandate.budget, askAbove: s.mandate.approvalAbove, categories: s.mandate.categories, shops: s.mandate.merchants ?? "any", spentThisPeriod: s.spentCents / 100, remaining: s.remainingCents / 100 })),
    simulated: d.mandates.filter((m: any) => m.source === "Simulated"),
  });
});

const proposeChange = tool("propose_mandate_change",
  "Draft a change to a mandate for the person to review. This does not change anything: the person re-signs in Mandate. Use after looking at the data.",
  { type: "object", properties: { mandateId: { type: "string" }, change: { type: "object", properties: { approvalAbove: { type: "string" }, budgetAmount: { type: "string" }, addCategories: { type: "array", items: { type: "string" } }, removeCategories: { type: "array", items: { type: "string" } }, shops: { type: "array", items: { type: "string" } } } }, evidence: { type: "string", description: "The numbers behind the recommendation" } }, required: ["mandateId", "change", "evidence"] },
  async (a) => JSON.stringify({ status: "draft_for_review", note: "Shown to the person; nothing changed. They re-sign the mandate in Mandate to apply it.", ...a }));

const STARTERS = [
  { label: "Audit my mandates", prompt: "Audit my mandates: where are agents getting blocked or needing approval most, and should any rule change?" },
  { label: "Blocked by agent", prompt: "Add a chart of blocked attempts by agent and rule." },
  { label: "Live activity only", prompt: "Filter this page to Live activity and summarise what happened." },
];

export function buildAi(): AgAiHarnessSetup {
  const adapter = claudeAdapter();
  return ({ api }) => createAiHarness(api, ({ tools, builtIn }) => ({
    primary: "auditor",
    promptStarters: STARTERS,
    agents: [
      directLlmRunner({
        id: "auditor", name: "Mandate auditor", adapter, maxTurns: 14,
        description: "Audits AI-agent spending against signed PayPal mandates and recommends rule changes.",
        instructions: () => [
          "You are the Mandate auditor inside a spend console for AI shopping agents that pay with PayPal under signed mandates.",
          "Answer questions about agent spending with numbers from the data (use the query tool) and the mandates (get_mandates). Be brief and concrete.",
          "Rows with source = Simulated are simulated history from the real policy engine; say so when you use them. Live rows are real PayPal sandbox activity.",
          "When a rule clearly fits badly (frequent approvals for small routine items, repeated blocks for something the person keeps approving), call propose_mandate_change with the evidence. Never claim a change was applied.",
          "For any request to add, change, move or remove widgets, filters or pages, delegate to the lead agent with a clear task.",
        ].join("\n"),
        tools: ({ studio, tools: t }) => [studio.viewSchema(), studio.viewPage(), studio.executeQuery(), getMandates, proposeChange, t.delegateTo(["lead"]), t.renameThread()],
      }),
      ...Object.values(builtIn).map((def) => directLlmRunner({ ...def, adapter })),
    ],
  }));
}
