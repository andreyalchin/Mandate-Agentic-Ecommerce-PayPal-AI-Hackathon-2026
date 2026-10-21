import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, amt, CATEGORIES, dateOf, per, USER_ID, type Category, type Mandate, type MandateInput, type Wallet } from "./api";
import { Icon, MicButton, PayPalButton, Spinner } from "./ui";
import { useSpeech } from "./speech";

/*
 * Mandate setup, ordered for conversion: show value first, ask for PayPal last.
 *   1. Choose: one-tap templates, or describe it (typed or spoken; Claude drafts the rules).
 *   2. Limits: friendly presets, plus a live preview run by the real policy engine.
 *   3. Activate: link PayPal (if needed) and sign in one step.
 * The draft survives reloads and the PayPal popup via sessionStorage.
 */

const CAT_META: Record<Category, { label: string; icon: (s?: number) => ReactNode }> = {
  coffee: { label: "Coffee", icon: Icon.coffee }, kitchen: { label: "Kitchen", icon: Icon.pot }, household: { label: "Household", icon: Icon.home },
  books: { label: "Books", icon: Icon.book }, electronics: { label: "Electronics", icon: Icon.chip }, gifts: { label: "Gifts", icon: Icon.gift }, digital: { label: "Digital", icon: Icon.cloud },
};

type Template = { id: string; title: string; blurb: string; categories: Category[]; budget: string; askAbove: string; merchants?: string[] };
const TEMPLATES: Template[] = [
  { id: "coffee", title: "Coffee runs", blurb: "Beans, filters and brewing gear", categories: ["coffee", "kitchen"], budget: "60", askAbove: "25" },
  { id: "household", title: "Household basics", blurb: "Soap, paper goods, cleaning", categories: ["household"], budget: "80", askAbove: "20" },
  { id: "kitchen", title: "Kitchen restock", blurb: "Tools and small appliances", categories: ["kitchen"], budget: "120", askAbove: "40" },
  { id: "books", title: "Books", blurb: "A new read now and then", categories: ["books", "digital"], budget: "40", askAbove: "25" },
  { id: "gifts", title: "Gifts", blurb: "Birthdays and thank-yous", categories: ["gifts"], budget: "100", askAbove: "30" },
  { id: "tech", title: "Cables & gadgets", blurb: "Chargers, cables, small tech", categories: ["electronics"], budget: "50", askAbove: "20" },
];

const PERIOD_WORD: Record<MandateInput["budget"]["period"], string> = { week: "a week", month: "a month", once: "in total" };
const ENDS = [{ id: "1", label: "1 month", months: 1 }, { id: "3", label: "3 months", months: 3 }, { id: "12", label: "1 year", months: 12 }];
const inMonths = (n: number) => { const d = new Date(); d.setMonth(d.getMonth() + n); d.setHours(23, 59, 0, 0); return d.toISOString(); };
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
/** The sentence the person signs, regenerated from the fields so it always matches the rules. */
export const sentence = (d: Pick<MandateInput, "categories" | "budget" | "approvalAbove" | "merchants">) =>
  `Buy ${list(d.categories.map((c) => CAT_META[c].label.toLowerCase()))}${d.merchants?.length ? ` from ${list(d.merchants)}` : ""}, up to ${amt(d.budget.amount)} ${PERIOD_WORD[d.budget.period]}. Ask me before anything over ${amt(d.approvalAbove)}.`;

const KEY = "mandate.setupDraft";
type Saved = { step: 1 | 2 | 3; draft: MandateInput | null; questions: string[]; ends: string };
const load = (): Saved | null => { try { return JSON.parse(sessionStorage.getItem(KEY) ?? "null"); } catch { return null; } };

function fromTemplate(t: Template, walletRef: string): MandateInput {
  const d = { userId: USER_ID, walletRef, currency: "USD", budget: { amount: t.budget, period: "month" as const }, approvalAbove: t.askAbove, categories: t.categories, merchants: t.merchants, expiresAt: inMonths(3) } as MandateInput;
  return { ...d, summary: sentence(d) };
}

function Steps({ at, go }: { at: 1 | 2 | 3; go: (s: 1 | 2 | 3) => void }) {
  const names = ["Choose", "Set limits", "Activate"];
  return <ol className="steps" aria-label="Setup progress">{names.map((n, i) => { const s = (i + 1) as 1 | 2 | 3; return (
    <li key={n} className={s < at ? "done" : s === at ? "now" : ""} aria-current={s === at ? "step" : undefined}>
      <button type="button" disabled={s >= at} onClick={() => go(s)}><span className="dot">{s < at ? Icon.check(12) : s}</span><span className="step-label">{n}</span></button>
    </li>); })}</ol>;
}

function Presets({ label, value, options, onChange, suffix }: { label: string; value: string; options: number[]; onChange: (v: string) => void; suffix?: string }) {
  const custom = !options.includes(Number(value));
  return (
    <div className="presets" role="group" aria-label={label}>
      {options.map((o) => <button key={o} type="button" className={`pchip ${Number(value) === o ? "on" : ""}`} aria-pressed={Number(value) === o} onClick={() => onChange(String(o))}>${o}</button>)}
      <span className={`money-in pchip-in ${custom ? "on" : ""}`}>$<input aria-label={`${label}, custom amount`} inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ""))} />{suffix && <span className="muted">{suffix}</span>}</span>
    </div>
  );
}

type PreviewRow = { name: string; price: string; merchant: string; decision: "allow" | "needs_approval" | "deny"; reason: string };
const VERDICT = { allow: { t: "Buys it", c: "ok", i: Icon.check }, needs_approval: { t: "Asks you first", c: "warn", i: Icon.hand }, deny: { t: "Won't buy", c: "bad", i: Icon.x } } as const;

function Preview({ draft }: { draft: MandateInput }) {
  const [rows, setRows] = useState<PreviewRow[] | null>(null);
  const key = JSON.stringify([draft.categories, draft.budget, draft.approvalAbove, draft.merchants]);
  useEffect(() => {
    if (!Number(draft.budget.amount) || !Number(draft.approvalAbove)) return;
    const t = setTimeout(() => api<PreviewRow[]>("/api/mandates/preview", { ...draft, walletRef: "pending" }).then(setRows).catch(() => setRows([])), 250);
    return () => clearTimeout(t);
  }, [key]);
  return (
    <aside className="preview card" aria-live="polite" aria-label="What your agent would do">
      <p className="eyebrow">{Icon.shield(12)} What your agent would do</p>
      {!rows ? <div className="pv-skel" /> : <ul className="pv-list">{rows.map((r) => { const v = VERDICT[r.decision]; return (
        <li key={r.name} className={`pv ${v.c}`}>
          <span className="pv-ic">{v.i(14)}</span>
          <span className="pv-main"><b>{r.name}</b><span className="xs muted">${Number(r.price).toFixed(2)} · {r.merchant}</span></span>
          <span className={`pv-v ${v.c}`}>{v.t}</span>
        </li>); })}</ul>}
      <p className="xs muted">Decided by the same rules engine that checks every real purchase.</p>
    </aside>
  );
}

export function Setup({ wallet, onWallet, onSigned, onCancel }: { wallet: Wallet | null; onWallet: (w: Wallet) => void; onSigned: (m: Mandate) => void; onCancel?: () => void }) {
  const saved = useRef(load()).current;
  const [step, setStep] = useState<1 | 2 | 3>(saved?.draft ? saved.step : 1);
  const [draft, setDraft] = useState<MandateInput | null>(saved?.draft ?? null);
  const [questions, setQuestions] = useState<string[]>(saved?.questions ?? []);
  const [ends, setEnds] = useState(saved?.ends ?? "3");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<"draft" | "sign" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const speech = useSpeech({ onInterim: setText, onFinal: setText, onError: setErr });
  useEffect(() => { sessionStorage.setItem(KEY, JSON.stringify({ step, draft, questions, ends } satisfies Saved)); }, [step, draft, questions, ends]);
  useEffect(() => { window.scrollTo({ top: 0, behavior: "smooth" }); }, [step]);

  const walletRef = wallet?.walletRef ?? "pending";
  const set = (patch: Partial<MandateInput>) => setDraft((d) => { if (!d) return d; const n = { ...d, ...patch }; return { ...n, summary: sentence(n) }; });
  const toggle = (c: Category) => draft && set({ categories: draft.categories.includes(c) ? (draft.categories.length > 1 ? draft.categories.filter((x) => x !== c) : draft.categories) : [...draft.categories, c] });
  const valid = !!draft && Number(draft.budget.amount) > 0 && Number(draft.approvalAbove) > 0 && draft.categories.length > 0;

  function pick(t: Template) { setDraft(fromTemplate(t, walletRef)); setQuestions([]); setEnds("3"); setStep(2); }
  async function describe() {
    setBusy("draft"); setErr(null);
    try {
      const d = await api<{ mandate: MandateInput; clarifications: string[] }>("/api/mandates/draft", { text, userId: USER_ID, walletRef });
      setDraft({ ...d.mandate, summary: sentence(d.mandate) }); setQuestions(d.clarifications); setEnds("3"); setStep(2);
    } catch (e: any) { setErr(e.status === 503 ? "The drafting assistant is offline. Pick a template instead." : "Couldn't turn that into rules. Try a budget and what to buy, or pick a template."); }
    finally { setBusy(null); }
  }
  async function activate(ref: string) {
    if (!draft) return;
    setBusy("sign"); setErr(null);
    try {
      const m = await api<Mandate>("/api/mandates", { ...draft, walletRef: ref, expiresAt: inMonths(ENDS.find((e) => e.id === ends)!.months) });
      sessionStorage.removeItem(KEY); onSigned(m);
    } catch (e: any) { setErr(e.message ?? "Couldn't activate. Try again."); setBusy(null); }
  }

  return (
    <main className="setup">
      <header className="setup-head">
        {onCancel && <button className="link back" onClick={() => { sessionStorage.removeItem(KEY); onCancel(); }}>← Back to my mandates</button>}
        <p className="eyebrow">{onCancel ? "New mandate" : "AI shopping, on your terms"}</p>
        <h1>{step === 1 ? (onCancel ? "What should this agent take care of?" : "Put the household shopping on autopilot.") : step === 2 ? "Set the limits" : "Turn it on"}</h1>
        {step === 1 && <p className="lede">Your agent finds and buys what you need, but only inside the limits you set. Anything bigger comes back to you for one tap.</p>}
        {step === 1 && !onCancel && <ul className="trust" aria-label="How you stay in control">
          <li>{Icon.lock(14)} Never spends past your budget</li><li>{Icon.hand(14)} Asks before big purchases</li><li>{Icon.undo(14)} Undo any purchase</li>
        </ul>}
      </header>
      <Steps at={step} go={setStep} />

      {step === 1 && <>
        <section aria-labelledby="t1" className="choose">
          <h2 id="t1" className="sec-title">Start from a template</h2>
          <div className="tpl-grid">{TEMPLATES.map((t) => (
            <button key={t.id} className="tpl" onClick={() => pick(t)}>
              <span className="tpl-ic">{CAT_META[t.categories[0]].icon(20)}</span>
              <span className="tpl-text"><b>{t.title}</b><span>{t.blurb}</span></span>
              <span className="tpl-meta num">${t.budget}/mo · asks over ${t.askAbove}</span>
            </button>))}
          </div>
        </section>
        <section className="card step-card describe" aria-labelledby="t2">
          <h2 id="t2" className="sec-title">{Icon.pen(15)} Or say it in your own words</h2>
          <label className="sr" htmlFor="intent">Instructions for your agent</label>
          <div className="speak-box">
            <textarea id="intent" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={speech.listening ? "Listening…" : "e.g. Keep us stocked on coffee and filters. Up to $60 a month, check with me over $25."} />
            <MicButton supported={speech.supported} listening={speech.listening} onClick={speech.toggle} />
          </div>
          <div className="row between wrap">
            <p className="fine">{speech.supported ? <>{Icon.mic(13)} Tap the mic to say it instead.</> : "Claude turns this into rules you can review."}</p>
            <button className="btn primary" disabled={text.trim().length < 8 || !!busy} onClick={describe}>{busy === "draft" ? <><Spinner /> Writing your rules…</> : <>Continue {Icon.arrowRight(15)}</>}</button>
          </div>
        </section>
      </>}

      {step === 2 && draft && (
        <div className="limits">
          <section className="card step-card" aria-label="Limits">
            <div className="field-g">
              <h3>How much can it spend?</h3>
              <Presets label="Budget" value={draft.budget.amount} options={[25, 50, 100, 200]} onChange={(v) => set({ budget: { ...draft.budget, amount: v } })} />
              <div className="seg sm" role="radiogroup" aria-label="Budget period">{(["week", "month", "once"] as const).map((p) => <button key={p} role="radio" aria-checked={draft.budget.period === p} className={draft.budget.period === p ? "on" : ""} onClick={() => set({ budget: { ...draft.budget, period: p } })}>{p === "week" ? "Per week" : p === "month" ? "Per month" : "One-time"}</button>)}</div>
            </div>
            <div className="field-g">
              <h3>Ask me before buying anything over</h3>
              <Presets label="Ask above" value={draft.approvalAbove} options={[10, 25, 50]} onChange={(v) => set({ approvalAbove: v })} />
              <p className="xs muted">You'll get a one-tap approval. Nothing is charged until you say yes.</p>
            </div>
            <div className="field-g">
              <h3>What it can buy</h3>
              <div className="cats">{CATEGORIES.map((c) => <button key={c} type="button" className={`cat ${draft.categories.includes(c) ? "on" : ""}`} aria-pressed={draft.categories.includes(c)} onClick={() => toggle(c)}>{CAT_META[c].icon(15)} {CAT_META[c].label}</button>)}</div>
              {draft.merchants?.length ? <p className="xs muted">Only from {list(draft.merchants)}. <button className="link" onClick={() => set({ merchants: undefined })}>Allow any shop</button></p> : null}
            </div>
            <div className="field-g">
              <h3>Ends after</h3>
              <div className="seg sm" role="radiogroup" aria-label="Ends after">{ENDS.map((e) => <button key={e.id} role="radio" aria-checked={ends === e.id} className={ends === e.id ? "on" : ""} onClick={() => setEnds(e.id)}>{e.label}</button>)}</div>
            </div>
            {questions.length > 0 && <div className="questions"><p className="eyebrow">{Icon.spark(12)} Worth a look</p><ul>{questions.map((q, i) => <li key={i}>{q}</li>)}</ul></div>}
          </section>
          <div className="limits-side">
            <section className="card summary-card" aria-label="Your rules in one sentence">
              <p className="eyebrow">Your rules</p>
              <p className="statement">“{draft.summary}”</p>
            </section>
            <Preview draft={draft} />
          </div>
          <div className="limits-cta">
            <button className="btn ghost" onClick={() => setStep(1)}>Back</button>
            <button className="btn primary lg" disabled={!valid} onClick={() => setStep(3)}>Continue {Icon.arrowRight(15)}</button>
          </div>
        </div>
      )}

      {step === 3 && draft && (
        <section className="card step-card activate" aria-labelledby="s3">
          <div className="recap">
            <p className="eyebrow">You're approving</p>
            <p id="s3" className="statement">“{draft.summary}”</p>
            <div className="recap-chips"><span>{amt(draft.budget.amount)} {per(draft.budget.period)}</span><span>asks over {amt(draft.approvalAbove)}</span><span>ends {dateOf(inMonths(ENDS.find((e) => e.id === ends)!.months))}</span><button className="link" onClick={() => setStep(2)}>Edit</button></div>
          </div>
          {wallet ? <>
            <div className="linked">{Icon.check(14)} Pays with {wallet.label || "your PayPal account"}</div>
            <button className="btn primary lg block" disabled={!!busy} onClick={() => activate(wallet.walletRef)}>{busy === "sign" ? <><Spinner /> Activating…</> : <>{Icon.lock(15)} Approve and activate</>}</button>
          </> : <>
            <div className="pp-why">
              <h2 className="sec-title">Link PayPal to finish</h2>
              <p className="sm muted">Your agent pays through PayPal, so your card details never touch it. PayPal shows a $1.00 check that's voided right away. Unlink anytime.</p>
            </div>
            {busy === "sign" ? <div className="row center"><Spinner /> Activating…</div> : <PayPalButton kind="vault" onDone={(w: any) => { const wl = { walletRef: w.walletRef, label: w.label, createdAt: new Date().toISOString() }; onWallet(wl); activate(wl.walletRef); }} onError={setErr} />}
            <p className="fine center">Sandbox: sign in with the test buyer from the README. No real money moves.</p>
          </>}
          <ul className="assure xs muted"><li>{Icon.lock(13)} Rules are locked with your signature, so no agent can change them.</li><li>{Icon.hand(13)} Revoke stops all spending instantly.</li></ul>
        </section>
      )}
      {err && <p className="toast err" role="alert">{err}</p>}
    </main>
  );
}
