// The spending report's opening layout. Field ids ("attempts.spent") refer to ./data.ts.
// Filters (period, mandate, your data vs sample) live in the page header and pre-filter the data.
import type { AgPageState, AgReportState, AgWidgetLayoutState } from "ag-studio";

const at = (xTrack: number, yTrack: number, xSpan: number, ySpan: number): AgWidgetLayoutState => ({ xTrack, yTrack, xSpan, ySpan });
const title = (text: string, subtitle?: string) => ({ title: { enabled: true, text }, ...(subtitle && { subtitle: { enabled: true, text: subtitle } }) });
const noTitle = { title: { enabled: false } };
const sum = (id: string) => ({ id, aggregation: "sum" as const });
const max = (id: string) => ({ id, aggregation: "max" as const });
const f = (id: string) => ({ id });

const overview: AgPageState = {
  id: "overview",
  widgets: {
    summary: { type: "spend-summary", dataMapping: { outcome: [f("attempts.outcome")], count: [sum("attempts.attempts")], spent: [sum("attempts.spent")], amount: [sum("attempts.amount")] }, format: noTitle } as any,
    trend: { type: "spend-trend", dataMapping: { date: [f("attempts.day")], spent: [sum("attempts.spent")], blocked: [sum("attempts.blockedAmount")] }, format: title("Spending over time") } as any,
    where: { type: "spend-breakdown", dataMapping: { category: [f("attempts.category")], shop: [f("attempts.merchant")], spent: [sum("attempts.spent")] }, format: title("Where it went") } as any,
    meters: { type: "mandate-meter", dataMapping: { mandate: [f("mandates.title")], spent: [sum("attempts.spentThisMonth")], budget: [max("mandates.budget")], askAbove: [max("mandates.askAbove")] }, format: title("Budgets this month") } as any,
    flow: { type: "decision-flow", dataMapping: { outcome: [f("attempts.outcome")], value: [sum("attempts.attempts")] }, format: title("How your rules decided") } as any,
    ledger: { type: "purchase-history", dataMapping: Object.fromEntries(["id", "at", "item", "merchant", "agent", "outcome", "image", "mandate", "mandateId", "rule", "reason", "rationale", "source"].map((k) => [k, [f(`attempts.${k}`)]]).concat([["amount", [f("attempts.amount")]]])), format: title("Purchase history", "Everything your agents bought or tried. Click a row for its receipt.") } as any,
  },
  widgetLayout: {
    summary: at(0, 0, 24, 7),
    trend: at(0, 7, 16, 16), where: at(16, 7, 8, 16),
    meters: at(0, 23, 12, 15), flow: at(12, 23, 12, 15),
    ledger: at(0, 38, 24, 30),
  },
};

const agents: AgPageState = {
  id: "agents",
  widgets: {
    cards: { type: "agent-cards", dataMapping: { agent: [f("attempts.agent")], outcome: [f("attempts.outcome")], count: [sum("attempts.attempts")], spent: [sum("attempts.spent")], amount: [sum("attempts.amount")] }, format: noTitle } as any,
    rules: { type: "rule-list", dataMapping: { rule: [f("attempts.rule")], count: [sum("attempts.attempts")] }, format: title("Which rule decided") } as any,
    activity: { type: "purchase-history", dataMapping: Object.fromEntries(["id", "at", "item", "merchant", "agent", "outcome", "image", "mandate", "mandateId", "rule", "reason", "rationale", "source"].map((k) => [k, [f(`attempts.${k}`)]]).concat([["amount", [f("attempts.amount")]]])), format: title("Purchase history by agent", "Click a row for its receipt.") } as any,
  },
  widgetLayout: { cards: at(0, 0, 24, 15), rules: at(0, 15, 9, 24), activity: at(9, 15, 15, 24) },
};
/** How many rows each list-like widget needs for the data on screen. */
export interface Counts { agents: number; rules: number; mandates: number; groups: number; rows?: number }
const agentsDesk = (c: Counts): AgPageState => { const perRow = typeof innerWidth === "number" && innerWidth >= 1380 ? 5 : innerWidth >= 1100 ? 4 : 3; const h = Math.ceil(Math.max(1, c.agents) / perRow) * 13 + 2; return { ...agents, widgetLayout: { cards: at(0, 0, 24, h), rules: at(0, h, 9, 30), activity: at(9, h, 15, 30) } }; };

export const pageTitles: Record<string, string> = { overview: "Overview", agents: "Agents" };

/** Phones: AG Studio's canvas has no responsive mode, so stack every widget full width. */
const stack = (page: AgPageState, order: [string, number][]): AgPageState => {
  const widgetLayout: Record<string, AgWidgetLayoutState> = {}; let y = 0;
  for (const [id, h0] of order) { const h = Math.ceil(h0); widgetLayout[id] = at(0, y, 24, h); y += h; }
  return { ...page, widgetLayout };
};
const mobileOverview = (c: Counts) => stack(overview, [["summary", 13], ["trend", 17], ["where", 7 + Math.min(7, Math.max(1, c.groups)) * 3], ["meters", 5 + Math.max(1, c.mandates) * 4], ["flow", 16], ["ledger", 7 + Math.min(14, Math.max(2, c.rows ?? 14)) * 1.4]]);
const mobileAgents = (c: Counts) => stack(agents, [["cards", 3 + Math.max(1, c.agents) * 13], ["rules", 5 + Math.max(1, c.rules) * 3.5], ["activity", 7 + Math.min(14, Math.max(2, c.rows ?? 14)) * 1.4]]);

/** Canvas height in rows for a page, so the phone page can scroll naturally instead of inside a box. */
export const pageRows = (p: AgPageState) => Math.max(...Object.values(p.widgetLayout ?? {}).map((l: any) => l.yTrack + l.ySpan));
const base = { panels: { filters: { collapsed: true }, data: { collapsed: true } } };
const ONE: Counts = { agents: 3, rules: 5, mandates: 2, groups: 3 };
export const reportFor = (phone: boolean, page: string, c: Counts = ONE): AgReportState => ({ selectedPageId: page, pages: phone ? [mobileOverview(c), mobileAgents(c)] : [overview, agentsDesk(c)], ...base }) as any;
export const consoleReport = reportFor(false, "overview");
