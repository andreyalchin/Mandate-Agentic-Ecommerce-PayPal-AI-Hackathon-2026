// The spend console's opening report. Field ids ("attempts.spent") refer to ./data.ts.
import type { AgPageState, AgReportState, AgWidgetLayoutState } from "ag-studio";

const at = (xTrack: number, yTrack: number, xSpan: number, ySpan: number): AgWidgetLayoutState => ({ xTrack, yTrack, xSpan, ySpan });
const title = (text: string) => ({ title: { enabled: true, text } });
const sum = (id: string) => ({ id, aggregation: "sum" as const });
const max = (id: string) => ({ id, aggregation: "max" as const });
const FONT = '"Switzer", "Inter", system-ui, sans-serif';
const typo = (fontSize: number, fontWeight: "normal" | "bold" = "normal") => ({ fontFamily: FONT, fontSize, fontWeight, fontStyle: "normal" as const });
const kpi = (text: string, value: any, sparklineX?: string) => ({
  type: "value" as const,
  dataMapping: { value: [value], ...(sparklineX && { sparklineX: [{ id: sparklineX }] }) },
  format: { title: { enabled: true, text, typography: typo(13, "bold") }, caption: { enabled: true, text: "", typography: typo(0) }, style: { typography: typo(24) } },
});
const legend = { style: { theme: { common: { legend: { enabled: true } } } } };

const overview: AgPageState = {
  id: "overview",
  widgets: {
    source: { type: "button-filter", dataMapping: { value: [{ id: "attempts.source" }] }, format: { ...title("Source"), style: { selection: { type: "single" }, dimensions: { height: 28, minWidth: 64 } } } } as any,
    period: { type: "date-filter", dataMapping: { value: [{ id: "attempts.day" }] }, format: { style: { filterType: "relative" } } } as any,
    "kpi-spent": kpi("Spent by agents", sum("attempts.spent"), "calendar::week"),
    "kpi-attempts": kpi("Attempts", sum("attempts.attempts"), "calendar::week"),
    "kpi-blocked": kpi("Blocked value", sum("attempts.blockedAmount"), "calendar::week"),
    "kpi-blockrate": kpi("Block rate", { id: "blockRate" }),
    meters: { type: "mandate-meter", dataMapping: { mandate: [{ id: "mandates.summary" }], spent: [sum("attempts.spentThisMonth")], budget: [max("mandates.budget")], askAbove: [max("mandates.askAbove")] }, format: title("This month vs monthly budget") } as any,
    flow: { type: "decision-flow", dataMapping: { outcome: [{ id: "attempts.outcome" }], value: [sum("attempts.attempts")] }, format: title("What the policy engine decided") } as any,
    weekly: { type: "column-chart-stacked", dataMapping: { categoryKey: [{ id: "calendar::week" }], valueKey: [sum("attempts.amount")], legendKey: [{ id: "attempts.outcome" }] }, format: { ...title("Attempted value by week and outcome"), ...legend } } as any,
    rules: { type: "bar-chart-grouped", dataMapping: { categoryKey: [{ id: "attempts.rule" }], valueKey: [sum("attempts.attempts")] }, format: title("Which rule decided") } as any,
    ledger: {
      type: "grid",
      dataMapping: { cols: [{ id: "attempts.day" }, { id: "attempts.source" }, { id: "attempts.agent" }, { id: "attempts.item" }, { id: "attempts.outcome" }, { id: "attempts.rule" }, sum("attempts.amount"), sum("attempts.spent"), { id: "attempts.paypalOrderId" }] },
      sort: [{ field: { id: "attempts.day" }, direction: "desc" }],
      format: title("Every attempt, newest first"),
    } as any,
  },
  widgetLayout: {
    source: at(0, 0, 8, 5), period: at(8, 0, 16, 5),
    "kpi-spent": at(0, 5, 6, 7), "kpi-attempts": at(6, 5, 6, 7), "kpi-blocked": at(12, 5, 6, 7), "kpi-blockrate": at(18, 5, 6, 7),
    meters: at(0, 12, 12, 14), flow: at(12, 12, 12, 14),
    weekly: at(0, 26, 14, 20), rules: at(14, 26, 10, 20),
    ledger: at(0, 46, 24, 24),
  },
};

const agents: AgPageState = {
  id: "agents",
  widgets: {
    "by-agent": { type: "column-chart-stacked", dataMapping: { categoryKey: [{ id: "attempts.agent" }], valueKey: [sum("attempts.attempts")], legendKey: [{ id: "attempts.outcome" }] }, format: { ...title("Attempts by agent and outcome"), ...legend } } as any,
    "spend-tree": { type: "treemap-chart", dataMapping: { categoryKey: [{ id: "attempts.agent" }, { id: "attempts.merchant" }], valueKey: [sum("attempts.spent")] }, format: title("Where agents spent") } as any,
    "category-sunburst": { type: "sunburst-chart", dataMapping: { categoryKey: [{ id: "attempts.category" }, { id: "attempts.outcome" }], valueKey: [sum("attempts.amount")] }, format: title("Attempted value by category and outcome") } as any,
    blocked: {
      type: "grid",
      dataMapping: { cols: [{ id: "attempts.day" }, { id: "attempts.agent" }, { id: "attempts.item" }, { id: "attempts.rule" }, { id: "attempts.reason" }, sum("attempts.blockedAmount")] },
      filter: [{ field: { id: "attempts.outcome" }, type: "set", values: ["Blocked"] }],
      sort: [{ field: { id: "attempts.day" }, direction: "desc" }],
      format: title("Blocked attempts and the rule that stopped them"),
    } as any,
  },
  widgetLayout: { "by-agent": at(0, 0, 12, 20), "spend-tree": at(12, 0, 12, 20), "category-sunburst": at(0, 20, 9, 22), blocked: at(9, 20, 15, 22) },
};

export const pageTitles: Record<string, string> = { overview: "Overview", agents: "Agents" };
export const consoleReport: AgReportState = { selectedPageId: overview.id, pages: [overview, agents], panels: { filters: { collapsed: true }, data: { collapsed: true } } } as any;
