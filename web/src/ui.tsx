import { useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "./api";
import { eligible } from "./paypal";

declare global { namespace JSX { interface IntrinsicElements { "paypal-button": any } } }

const P = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;
export const Icon = {
  check: (s = 16) => <svg width={s} height={s} viewBox="0 0 24 24" aria-hidden {...P}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>,
  x: (s = 16) => <svg width={s} height={s} viewBox="0 0 24 24" aria-hidden {...P}><path d="M6 6l12 12M18 6L6 18" /></svg>,
  hand: (s = 16) => <svg width={s} height={s} viewBox="0 0 24 24" aria-hidden {...P}><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5l3 2" /></svg>,
  shield: (s = 16) => <svg width={s} height={s} viewBox="0 0 24 24" aria-hidden {...P}><path d="M12 3l7.5 3v5.5c0 4.5-3.2 8.2-7.5 9.5-4.3-1.3-7.5-5-7.5-9.5V6L12 3z" /><path d="M8.8 12.2l2.2 2.2 4.3-4.4" /></svg>,
  undo: (s = 16) => <svg width={s} height={s} viewBox="0 0 24 24" aria-hidden {...P}><path d="M9 14L4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 010 11H11" /></svg>,
  search: (s = 14) => <svg width={s} height={s} viewBox="0 0 24 24" aria-hidden {...P}><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></svg>,
  cart: (s = 14) => <svg width={s} height={s} viewBox="0 0 24 24" aria-hidden {...P}><path d="M3 4h2.5l2.2 11h10.6l2-8H6.6" /><circle cx="9.5" cy="19.5" r="1.3" /><circle cx="17" cy="19.5" r="1.3" /></svg>,
  send: (s = 18) => <svg width={s} height={s} viewBox="0 0 24 24" aria-hidden {...P}><path d="M5 12h13M13 6l6 6-6 6" /></svg>,
  spark: (s = 14) => <svg width={s} height={s} viewBox="0 0 24 24" aria-hidden {...P}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.5 2.5M15.2 15.2l2.5 2.5M6.3 17.7l2.5-2.5M15.2 8.8l2.5-2.5" /></svg>,
  key: (s = 14) => <svg width={s} height={s} viewBox="0 0 24 24" aria-hidden {...P}><circle cx="8" cy="15" r="4" /><path d="M11 12l8-8M16 7l2 2M14 9l2 2" /></svg>,
};

export function Wordmark() {
  return <span className="wordmark"><svg width="22" height="22" viewBox="0 0 32 32" aria-hidden><rect width="32" height="32" rx="8" fill="currentColor" /><path d="M9 22V10l7 7 7-7v12" stroke="var(--paper)" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>Mandate</span>;
}

export function Spinner() { return <span className="spinner" aria-hidden />; }

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return <div className="skel-wrap" aria-busy="true">{Array.from({ length: lines }, (_, i) => <div key={i} className="skeleton" style={{ width: `${92 - i * 14}%` }} />)}</div>;
}

/** Animated count between values (money in cents). */
export function Count({ cents }: { cents: number }) {
  const [v, setV] = useState(cents); const from = useRef(cents);
  useEffect(() => {
    const start = performance.now(), a = from.current, b = cents; let raf = 0;
    const tick = (t: number) => { const k = Math.min(1, (t - start) / 600), e = 1 - Math.pow(1 - k, 3); setV(Math.round(a + (b - a) * e)); if (k < 1) raf = requestAnimationFrame(tick); else from.current = b; };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [cents]);
  return <span className="num">${(v / 100).toFixed(2)}</span>;
}

type PPMode = { kind: "vault"; onDone: (w: { walletRef: string }) => void } | { kind: "approve"; cartId: string; onDone: (r: any) => void };

/**
 * PayPal v6 button. "vault" saves PayPal without a purchase (buyer consent for agent charges);
 * "approve" pays for one out-of-scope cart the agent proposed (AP2 Cart Mandate).
 */
export function PayPalButton(props: PPMode & { onError?: (m: string) => void }) {
  const ref = useRef<HTMLElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "busy" | "unavailable">("loading");
  const cb = useRef(props); cb.current = props;
  useEffect(() => {
    let cancelled = false; let el: HTMLElement | null = null; let handler: (() => void) | null = null;
    (async () => {
      try {
        const { sdk, ok } = await eligible(props.kind === "vault" ? "VAULT_WITHOUT_PAYMENT" : undefined);
        if (cancelled) return;
        if (!ok) { setState("unavailable"); return; }
        const fail = (m: string) => { setState("ready"); cb.current.onError?.(m); };
        const session = props.kind === "vault"
          ? sdk.createPayPalSavePaymentSession({
              onApprove: async ({ vaultSetupToken }: any) => { try { const w = await api("/api/vault/payment-token", { setupTokenId: vaultSetupToken }); (cb.current as any).onDone(w); } catch (e: any) { fail(e.message); } },
              onCancel: () => setState("ready"), onError: (e: any) => fail(String(e?.message ?? e)),
            })
          : sdk.createPayPalOneTimePaymentSession({
              onApprove: async () => { try { const r = await api(`/api/cart-mandates/${(cb.current as any).cartId}/capture`, {}); (cb.current as any).onDone(r); } catch (e: any) { fail(e.message); } },
              onCancel: () => setState("ready"), onError: (e: any) => fail(String(e?.message ?? e)),
            });
        el = ref.current; if (!el) return;
        handler = () => {
          setState("busy");
          // Don't await before start(): it keeps the click's user activation for the popup.
          const p = props.kind === "vault"
            ? api("/api/vault/setup-token", { description: "Let your Mandate agent pay within the rules you sign" }).then((t: any) => ({ vaultSetupToken: t.id }))
            : api(`/api/cart-mandates/${props.cartId}/order`, {}).then((o: any) => ({ orderId: o.id }));
          session.start({ presentationMode: "auto" }, p).catch((e: any) => fail(e.message));
        };
        el.addEventListener("click", handler);
        setState("ready");
      } catch (e: any) { if (!cancelled) { setState("unavailable"); cb.current.onError?.(e.message); } }
    })();
    return () => { cancelled = true; if (el && handler) el.removeEventListener("click", handler); };
  }, [props.kind, (props as any).cartId]);
  return (
    <div className={`pp-wrap ${state}`}>
      <paypal-button ref={ref} type="pay" class="pp-btn" hidden={state === "loading" || state === "unavailable" ? true : undefined} />
      {state === "loading" && <div className="skeleton pp-skel" />}
      {state === "busy" && <p className="hint">Finish in the PayPal window…</p>}
      {state === "unavailable" && <p className="hint err">PayPal is unavailable right now. Reload to try again.</p>}
    </div>
  );
}

export function Pill({ tone = "neutral", children }: { tone?: "neutral" | "ok" | "warn" | "bad" | "ink"; children: ReactNode }) {
  return <span className={`pill ${tone}`}>{children}</span>;
}
