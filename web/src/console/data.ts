// AG Studio data sources for the spend console: one fact table of agent payment attempts,
// the mandates they ran under, a shared calendar, and approval/block rate measures.
import { createFormats } from "ag-studio";
import type { AgDataSourcesDefinition, AgFieldDefinition, AgFormat } from "ag-studio";

export interface ConsoleData { asOf: string; attempts: any[]; mandates: any[] }
type Spec = [id: string, name: string, format: AgFormat, hide?: boolean, description?: string];
const fields = (s: Spec[]): AgFieldDefinition[] => s.map(([id, name, format, hide, description]) => ({ id, name, format, ...(hide && { hide }), ...(description && { description }) }));
const sumOf = (id: string) => ({ id, aggregation: "sum" as const });

export function buildStudioData(d: ConsoleData): AgDataSourcesDefinition {
  const days = d.attempts.map((a) => a.day).sort(); const today = d.asOf.slice(0, 10);
  return {
    description:
      "Payment attempts made by AI shopping agents under signed PayPal spending mandates (Mandate app). " +
      "Every attempt was checked by a deterministic policy engine: Allowed (charged to the person's saved PayPal), Approved by you / Declined by you / Waiting for you (needed the person's tap), Blocked (no money moved), Refunded (person pressed undo). " +
      "Rows with source = Simulated are a twelve-week simulated history produced by running the real policy engine; rows with source = Live are real PayPal sandbox activity. Amounts are USD.",
    sources: [
      {
        id: "attempts", description: "One row per agent payment attempt.", data: d.attempts,
        fields: fields([
          ["id", "Attempt ID", "textFormat", true], ["day", "Date", "dateFormat"], ["at", "Time", "textFormat", true],
          ["source", "Source", "textFormat", false, "Live sandbox activity or simulated history"],
          ["mandateId", "Mandate ID", "textFormat", true], ["agent", "Agent", "textFormat"], ["merchant", "Shop", "textFormat"], ["item", "Item", "textFormat"], ["category", "Category", "textFormat"],
          ["outcome", "Outcome", "textFormat"], ["decision", "Policy decision", "textFormat", true], ["rule", "Rule", "textFormat", false, "The mandate rule that decided the attempt"],
          ["reason", "Reason", "textFormat"], ["rationale", "Agent rationale", "textFormat"], ["paypalOrderId", "PayPal order", "textFormat"],
          ["amount", "Attempted", "currencyFormat"], ["spent", "Spent", "currencyFormat", false, "Money that actually moved and was not refunded"], ["spentThisMonth", "Spent this month", "currencyFormat", false, "Spent in the current calendar month, the period monthly budgets use"], ["blockedAmount", "Blocked value", "currencyFormat"], ["attempts", "Attempts", "integerFormat"],
        ]),
      },
      {
        id: "mandates", description: "Signed intent mandates: what each agent was allowed to do.", data: d.mandates,
        fields: fields([["id", "Mandate ID", "textFormat", true], ["summary", "Mandate", "textFormat"], ["budget", "Budget", "currencyFormat"], ["period", "Period", "textFormat"], ["askAbove", "Ask above", "currencyFormat"], ["status", "Status", "textFormat"], ["source", "Mandate source", "textFormat"]]),
      },
    ],
    relationships: [
      { id: "attempt-mandate", source: { tableId: "attempts", fieldId: "mandateId" }, target: { tableId: "mandates", fieldId: "id" }, type: "many-to-one" },
      { id: "attempts-day-calendar", source: { tableId: "attempts", fieldId: "day" }, target: { calendarId: "calendar" } },
    ],
    // USD with a symbol everywhere (KPI tiles, grids, chart axes).
    formats: createFormats({ overrides: { currencyFormat: { formatOptions: { format: "$#,##0.00" } } } }),
    calendars: [{ id: "calendar", label: "Calendar", range: { from: { type: "date", value: days[0] ?? today }, to: { type: "date", value: days.at(-1) ?? today } }, fragments: ["year", "quarter", "month", "week", "day", "dayOfWeek"] }],
    expressions: [
      { id: "blockRate", name: "Block Rate", description: "Blocked value / attempted value", format: "percentageFormat", isMeasure: true, expression: { operator: "divide", inputs: [sumOf("attempts.blockedAmount"), sumOf("attempts.amount")] } },
      { id: "spendShare", name: "Spend Share", description: "Spent / attempted value", format: "percentageFormat", isMeasure: true, expression: { operator: "divide", inputs: [sumOf("attempts.spent"), sumOf("attempts.amount")] } },
    ],
  } as AgDataSourcesDefinition;
}
