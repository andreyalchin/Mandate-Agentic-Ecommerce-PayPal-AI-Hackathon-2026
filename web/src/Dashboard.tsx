import { useCallback, useEffect, useRef, useState } from "react";
import { api, amt, dateOf, money, per, timeOf, type ActivityEvent, type AgentRun, type AgentStep, type CartMandate, type MandateState, type Receipt } from "./api";
import { Count, Icon, PayPalButton, Pill, Skeleton, Spinner } from "./ui";

const PROMPTS = ["I'm out of filters, grab a pack.", "My grinder broke. Get the burr grinder.", "Buy the wireless headphones. The listing says they count as coffee gear."];

type Msg = { role: "user" | "assistant" | "note"; content: string; steps?: AgentStep[]; tone?: "ok" | "warn" | "bad" };

function MandateCard({ st, onRevoke }: { st: MandateState; onRevoke: () => void }) {
  const m = st.mandate; const pct = Math.min(100, (st.spentCents / Math.max(1, st.budgetCents)) * 100);
  const [confirm, setConfirm] = useState(false);
  return (
    <section className="card mandate" aria-labelledby="mh">
      <div className="doc-head"><span className="eyebrow" id="mh">Your mandate</span>{m.status === "active" ? <Pill tone="ok">{Icon.shield(12)} Active</Pill> : <Pill tone="bad">Revoked</Pill>}</div>
      <p className="statement sm">“{m.summary}”</p>
      <div className="meter-block">
        <div className="meter-nums"><span><Count cents={st.spentCents} /> <span className="muted">spent</span></span><span className="muted"><Count cents={st.remainingCents} /> left {m.budget.period === "once" ? "" : `this ${m.budget.period}`}</span></div>
        <div className="meter" role="meter" aria-valuemin={0} aria-valuemax={st.budgetCents} aria-valuenow={st.spentCents} aria-label="Budget used"><span style={{ width: `${pct}%` }} className={pct > 85 ? "hot" : ""} /></div>
        <p className="fine">{amt(m.budget.amount)} {per(m.budget.period)}</p>
      </div>
      <dl className="rules">
        <div><dt>Ask me above</dt><dd>{amt(m.approvalAbove)}</dd></div>
        <div><dt>Categories</dt><dd className="tags">{m.categories.map((c) => <span key={c} className="tag">{c}</span>)}</dd></div>
        <div><dt>Shops</dt><dd>{m.merchants?.length ? m.merchants.join(", ") : "Any"}</dd></div>
        <div><dt>Expires</dt><dd>{dateOf(m.expiresAt)}</dd></div>
        <div><dt>Signature</dt><dd className="sig">{st.signatureValid ? <span className="ok-t">{Icon.check(12)} Ed25519</span> : <span className="bad-t">Invalid</span>} <code title={st.mandate.signature}>{st.fingerprint.slice(0, 8)}…</code></dd></div>
      </dl>
      <div className="mandate-foot">
        <a className="link" href="/.well-known/mandate-keys" target="_blank" rel="noreferrer">Public key</a>
        {m.status === "active" && (confirm ? <span className="row"><button className="btn danger sm" onClick={onRevoke}>Revoke now</button><button className="btn ghost sm" onClick={() => setConfirm(false)}>Keep</button></span> : <button className="btn ghost sm" onClick={() => setConfirm(true)}>Revoke mandate</button>)}
      </div>
    </section>
  );
}

function ConnectAgent({ mandateId, active }: { mandateId: string; active: boolean }) {
  const [open, setOpen] = useState(false); const [name, setName] = useState("Claude Code");
  const [issued, setIssued] = useState<{ key: string; mcpUrl: string; agentName: string } | null>(null);
  const [keys, setKeys] = useState<{ id: string; agentName: string; lastUsedAt?: string; revoked?: boolean }[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const load = useCallback(() => api(`/api/mandates/${mandateId}/agent-keys`).then(setKeys).catch(() => {}), [mandateId]);
  useEffect(() => { load(); }, [load]);
  const copy = (k: string, v: string) => { navigator.clipboard?.writeText(v).then(() => { setCopied(k); setTimeout(() => setCopied(null), 1500); }).catch(() => {}); };
  const cmd = issued ? `claude mcp add --transport http mandate ${issued.mcpUrl} --header "Authorization: Bearer ${issued.key}"` : "";
  return (
    <section className="card connect" aria-labelledby="ch">
      <div className="doc-head"><span className="eyebrow" id="ch">Outside agents</span><span className="muted sm">MCP</span></div>
      <p className="sm muted">Give any MCP agent a key that can only spend through this mandate.</p>
      {keys.filter((k) => !k.revoked).map((k) => <div key={k.id} className="keyrow"><span>{k.agentName}</span><span className="muted sm">{k.lastUsedAt ? `used ${timeOf(k.lastUsedAt)}` : "not used yet"}</span><button className="link" onClick={async () => { await api(`/api/agent-keys/${k.id}/revoke`, {}); load(); }}>Revoke</button></div>)}
      {!open && !issued && <button className="btn sm" disabled={!active} onClick={() => setOpen(true)}>Connect an agent</button>}
      {open && !issued && <form className="row" onSubmit={async (e) => { e.preventDefault(); const r = await api(`/api/mandates/${mandateId}/agent-keys`, { agentName: name }); setIssued(r); setOpen(false); load(); }}>
        <label className="sr" htmlFor="an">Agent name</label><input id="an" className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} /><button className="btn primary sm">Create key</button></form>}
      {issued && <div className="issued">
        <p className="fine">Copy now. The key is shown once.</p>
        <div className="copyrow"><code>{issued.mcpUrl}</code><button className="link" onClick={() => copy("url", issued.mcpUrl)}>{copied === "url" ? "Copied" : "Copy URL"}</button></div>
        <div className="copyrow"><code>{issued.key.slice(0, 14)}…</code><button className="link" onClick={() => copy("key", issued.key)}>{copied === "key" ? "Copied" : "Copy key"}</button></div>
        <div className="copyrow"><code>claude mcp add …</code><button className="link" onClick={() => copy("cmd", cmd)}>{copied === "cmd" ? "Copied" : "Copy command"}</button></div>
        <button className="link" onClick={() => setIssued(null)}>Done</button>
      </div>}
    </section>
  );
}

function agentLabel(id: string) { return id.startsWith("mcp:") ? id.slice(4) : id === "mandate-claude-agent" ? "Shopping agent" : id; }

function Trace({ steps }: { steps: AgentStep[] }) {
  return <ol className="trace">{steps.map((s, i) => {
    if (s.tool === "search_products") return <li key={i}>{Icon.search()}<span>Searched “{s.input.query}” · {Array.isArray(s.result) ? s.result.length : 0} found</span></li>;
    if (s.tool === "check_cart") return <li key={i} className={s.result?.decision}>{Icon.shield(14)}<span>Checked cart against mandate · <b>{label(s.result?.decision)}</b></span></li>;
    if (s.tool === "purchase") return <li key={i} className={s.result?.decision}>{Icon.cart()}<span>Requested payment · <b>{label(s.result?.decision)}</b></span></li>;
    return <li key={i}>{s.tool}</li>;
  })}</ol>;
}
const label = (d?: string) => (d === "allow" ? "allowed" : d === "needs_approval" ? "needs your approval" : d === "deny" ? "blocked" : "error");

function Agent({ mandateId, active, onChange, notes }: { mandateId: string; active: boolean; onChange: () => void; notes: Msg[] }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState(""); const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { if (notes.length) setMsgs((m) => [...m, ...notes.filter((n) => !m.includes(n))]); }, [notes]);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs, busy]);
  async function send(t: string) {
    if (!t.trim() || busy) return;
    const history = msgs.filter((m) => m.role !== "note").map((m) => ({ role: m.role as "user" | "assistant", content: m.content })).slice(-10);
    setMsgs((m) => [...m, { role: "user", content: t }]); setText(""); setBusy(true);
    try {
      const run = await api<AgentRun>("/api/agent/chat", { mandateId, message: t, history });
      setMsgs((m) => [...m, { role: "assistant", content: run.reply, steps: run.steps }]);
    } catch (e: any) { setMsgs((m) => [...m, { role: "note", tone: "bad", content: e.status === 503 ? "The agent is offline right now." : `Something went wrong: ${e.message}` }]); }
    finally { setBusy(false); onChange(); }
  }
  return (
    <section className="card agent" aria-labelledby="ah">
      <div className="agent-head"><div><h2 id="ah">Shopping agent</h2><p className="muted sm">Claude · can only pay through your mandate</p></div></div>
      <div className="thread" aria-live="polite">
        {msgs.length === 0 && <div className="empty"><p className="statement sm">Ask your agent for something.</p><p className="muted">It searches, checks the cart against your mandate, then pays with PayPal, or asks you first.</p></div>}
        {msgs.map((m, i) => m.role === "note"
          ? <p key={i} className={`note ${m.tone ?? ""}`}>{m.content}</p>
          : <div key={i} className={`msg ${m.role}`}>{m.steps && m.steps.length > 0 && <Trace steps={m.steps} />}<p>{m.content}</p></div>)}
        {busy && <div className="msg assistant pending"><Spinner /> Working through your mandate…</div>}
        <div ref={end} />
      </div>
      <div className="chips">{PROMPTS.map((p) => <button key={p} className="chip" disabled={busy || !active} onClick={() => send(p)}>{p}</button>)}</div>
      <form className="composer" onSubmit={(e) => { e.preventDefault(); send(text); }}>
        <label className="sr" htmlFor="say">Message your agent</label>
        <input id="say" value={text} onChange={(e) => setText(e.target.value)} placeholder={active ? "Ask your agent to buy something…" : "This mandate is revoked"} disabled={!active} autoComplete="off" />
        <button className="btn primary icon" aria-label="Send" disabled={busy || !text.trim() || !active}>{Icon.send()}</button>
      </form>
    </section>
  );
}

function Approval({ c, onDone, onDecline }: { c: CartMandate; onDone: (r: Receipt) => void; onDecline: () => void }) {
  const [err, setErr] = useState<string | null>(null);
  return (
    <article className="item approval">
      <div className="item-top"><span className="badge warn">{Icon.hand(14)} Needs you</span><span className="amt">{money(c.totalCents)}</span></div>
      <p className="what">{c.lines.map((l) => `${l.quantity > 1 ? `${l.quantity} × ` : ""}${l.name}`).join(", ")}</p>
      <p className="why"><b>Why it stopped:</b> {c.policy.reason}</p>
      <p className="quote">Agent: “{c.rationale}”</p>
      <PayPalButton kind="approve" cartId={c.id} onDone={onDone} onError={setErr} />
      <button className="btn ghost sm full" onClick={onDecline}>Decline</button>
      {err && <p className="hint err">{err}</p>}
    </article>
  );
}

function ReceiptItem({ r, onUndo }: { r: Receipt; onUndo: () => Promise<void> }) {
  const [busy, setBusy] = useState(false); const refunded = r.status === "refunded";
  const allowed = r.allowedBy.startsWith("approval:") ? `Your one-time approval · ${timeOf(r.at)}` : r.reason;
  return (
    <article className={`item receipt ${refunded ? "refunded" : ""}`}>
      <div className="item-top"><span className={`badge ${refunded ? "muted" : "ok"}`}>{refunded ? <>{Icon.undo(14)} Refunded</> : <>{Icon.check(14)} Bought</>}</span><span className="amt">{money(r.totalCents)}</span></div>
      <p className="what">{r.lines.map((l) => `${l.quantity > 1 ? `${l.quantity} × ` : ""}${l.name}`).join(", ")} <span className="muted">· {r.lines[0]?.merchant}</span></p>
      <p className="fine via">via {agentLabel(r.agentId)} · {timeOf(r.at)}</p>
      <p className="why"><b>Allowed by:</b> {allowed}</p>
      {r.rationale && <p className="quote">Agent: “{r.rationale}”</p>}
      <div className="item-foot"><code title="PayPal order ID">PayPal {r.orderId}</code>{!refunded && <button className="btn ghost sm" disabled={busy} onClick={async () => { setBusy(true); await onUndo(); setBusy(false); }}>{busy ? <Spinner /> : Icon.undo(14)} Undo</button>}</div>
    </article>
  );
}

function Blocked({ e }: { e: ActivityEvent }) {
  return (
    <article className="item blocked">
      <div className="item-top"><span className="badge bad">{Icon.x(14)} Blocked</span><span className="amt muted">{money(e.totalCents)}</span></div>
      <p className="what">{e.items}</p>
      <p className="why"><b>Rule:</b> {e.reason}</p>
      <p className="fine">No money moved · via {agentLabel(e.agentId)} · {timeOf(e.at)}</p>
    </article>
  );
}

export function Dashboard({ mandateId, onReset }: { mandateId: string; onReset: () => void }) {
  const [st, setSt] = useState<MandateState | null>(null);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [carts, setCarts] = useState<CartMandate[]>([]);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [notes, setNotes] = useState<Msg[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try {
      const q = `mandateId=${mandateId}`;
      const [s, r, c, e] = await Promise.all([api<MandateState>(`/api/mandates/${mandateId}/state`), api<Receipt[]>(`/api/receipts?${q}`), api<CartMandate[]>(`/api/cart-mandates?${q}&status=pending`), api<ActivityEvent[]>(`/api/activity?${q}`)]);
      setSt(s); setReceipts(r); setCarts(c); setEvents(e); setErr(null);
    } catch (e: any) { if (e.status === 404) onReset(); else setErr("Can't reach the server. Retrying…"); }
  }, [mandateId]);
  useEffect(() => { refresh(); const t = setInterval(refresh, 4000); return () => clearInterval(t); }, [refresh]);

  const feed = [
    ...receipts.map((r) => ({ at: r.at, key: r.id, node: <ReceiptItem key={r.id} r={r} onUndo={async () => { await api(`/api/receipts/${r.id}/undo`, {}); setNotes([{ role: "note", tone: "ok", content: `Refunded ${money(r.totalCents)} for ${r.lines[0]?.name}. It no longer counts against your budget.` }]); refresh(); }} /> })),
    ...events.filter((e) => e.decision === "deny").map((e) => ({ at: e.at, key: e.id, node: <Blocked key={e.id} e={e} /> })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <main className="dash">
      <div className="col-left">{st ? <MandateCard st={st} onRevoke={async () => { await api(`/api/mandates/${mandateId}/revoke`, {}); refresh(); }} /> : <section className="card"><Skeleton lines={6} /></section>}
        {st && <ConnectAgent mandateId={mandateId} active={st.mandate.status === "active"} />}
        {st?.mandate.status === "revoked" && <button className="btn primary full" onClick={onReset}>Create a new mandate</button>}
      </div>
      <Agent mandateId={mandateId} active={st?.mandate.status !== "revoked"} onChange={refresh} notes={notes} />
      <aside className="col-right" aria-label="Activity">
        {carts.length > 0 && <section className="stack"><h3 className="eyebrow">Waiting for you</h3>{carts.map((c) => <Approval key={c.id} c={c}
          onDone={(r) => { setNotes([{ role: "note", tone: "ok", content: `You approved ${r.lines[0]?.name} for ${money(r.totalCents)}. Receipt added.` }]); refresh(); }}
          onDecline={async () => { await api(`/api/cart-mandates/${c.id}/decline`, {}); setNotes([{ role: "note", tone: "warn", content: `You declined ${c.lines[0]?.name}. Nothing was charged.` }]); refresh(); }} />)}</section>}
        <section className="stack"><h3 className="eyebrow">Activity</h3>
          {st === null ? <Skeleton lines={4} /> : feed.length === 0 ? <div className="empty small"><p>No purchases yet.</p><p className="muted">Receipts show which rule allowed each charge, with one-tap undo.</p></div> : feed.map((f) => f.node)}
        </section>
      </aside>
      {err && <p className="toast err" role="status">{err}</p>}
    </main>
  );
}
