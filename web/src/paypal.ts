import { api } from "./api";

declare global { interface Window { paypal?: any } }

let sdkScript: Promise<void> | null = null;
let instance: { at: number; sdk: Promise<any> } | null = null;

function loadScript(): Promise<void> {
  sdkScript ??= api<{ sdkUrl: string }>("/api/config").then((cfg) => new Promise<void>((res, rej) => {
    const s = document.createElement("script"); s.src = cfg.sdkUrl; s.async = true; s.onload = () => res(); s.onerror = () => rej(new Error("PayPal SDK failed to load")); document.head.appendChild(s);
  }));
  return sdkScript;
}

/** One SDK instance per client token (tokens last 15 min; refresh at 10). */
export function sdk(): Promise<any> {
  if (instance && Date.now() - instance.at < 10 * 60_000) return instance.sdk;
  const p = (async () => {
    await loadScript();
    const { clientToken } = await api<{ clientToken: string }>("/api/client-token", {});
    return window.paypal.createInstance({ clientToken, components: ["paypal-payments"], pageType: "checkout" });
  })();
  p.catch(() => { instance = null; });
  instance = { at: Date.now(), sdk: p };
  return p;
}

export async function eligible(flow?: "VAULT_WITHOUT_PAYMENT"): Promise<{ sdk: any; ok: boolean }> {
  const s = await sdk();
  const m = await s.findEligibleMethods(flow ? { currencyCode: "USD", paymentFlow: flow } : { currencyCode: "USD" });
  return { sdk: s, ok: m.isEligible("paypal") };
}
