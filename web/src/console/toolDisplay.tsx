// How the auditor's own tools appear in AG Studio's AI Assistant transcript.
const money = (v?: string) => (v ? `$${Number(v).toFixed(Number(v) % 1 ? 2 : 0)}` : "");

function DraftChange({ args }: { args: any }) {
  const c = args?.change ?? {};
  const lines = [
    c.approvalAbove && `Ask above ${money(c.approvalAbove)}`,
    c.budgetAmount && `Budget ${money(c.budgetAmount)} a month`,
    c.addCategories?.length && `Allow ${c.addCategories.join(", ")}`,
    c.removeCategories?.length && `Stop allowing ${c.removeCategories.join(", ")}`,
    c.shops?.length && `Only from ${c.shops.join(", ")}`,
  ].filter(Boolean);
  return (
    <div className="draft-change">
      <div className="dc-head">Draft change · not applied</div>
      <ul>{lines.map((l) => <li key={String(l)}>{l}</li>)}</ul>
      {args?.evidence && <p>{args.evidence}</p>}
      <div className="dc-foot">The person re-signs the mandate in Mandate to apply it.</div>
    </div>
  );
}

export const aiToolDisplay: Record<string, any> = {
  get_mandates: { label: ({ status }: any) => ({ text: status === "done" ? "Read your mandates" : "Reading your mandates" }) },
  propose_mandate_change: {
    label: ({ args, status }: any) => ({ text: status === "done" ? "Drafted a mandate change" : "Drafting a mandate change", pill: String(args?.mandateId ?? "").replace("sim_", "") || undefined }),
    detail: DraftChange,
  },
};
