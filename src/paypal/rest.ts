import { randomUUID } from "node:crypto";
import { apiBase, PayPalConfig } from "./config.js";
import { fromBody, PayPalError } from "./errors.js";

interface CachedToken { value: string; expiresAt: number }

/**
 * Minimal REST client for endpoints the Server SDK does not expose
 * (client tokens for the v6 Web SDK, webhook signature verification, disputes).
 * - Caches the access token and refreshes 5 minutes before `expires_in`.
 * - Single-flight token fetch so concurrent calls share one request.
 * - PayPal-Request-Id on every POST, reused across retries.
 * - Exponential backoff with jitter on 429 and 5xx.
 */
export class PayPalRest {
  private token?: CachedToken;
  private inflight?: Promise<CachedToken>;
  constructor(private cfg: PayPalConfig, private fetchImpl: typeof fetch = fetch, private sleep = (ms: number) => new Promise((r) => setTimeout(r, ms)), staticToken?: string) {
    // Pre-issued access token (e.g. fetched through a credential proxy); used until it expires.
    if (staticToken) this.token = { value: staticToken, expiresAt: Date.now() + 8 * 3600 * 1000 };
  }

  private basic() {
    return "Basic " + Buffer.from(`${this.cfg.clientId}:${this.cfg.clientSecret}`).toString("base64");
  }

  async accessToken(): Promise<string> {
    if (this.token && Date.now() < this.token.expiresAt) return this.token.value;
    this.inflight ??= this.fetchToken(new URLSearchParams({ grant_type: "client_credentials" })).finally(() => (this.inflight = undefined));
    this.token = await this.inflight;
    return this.token.value;
  }

  /** Browser-safe client token for the v6 Web SDK (required for vaulting). */
  async clientToken(domains: string[]): Promise<{ token: string; expiresIn: number }> {
    const params = new URLSearchParams({ grant_type: "client_credentials", response_type: "client_token", intent: "sdk_init" });
    for (const d of domains) params.append("domains[]", d);
    const res = await this.fetchImpl(`${apiBase(this.cfg.env)}/v1/oauth2/token`, {
      method: "POST",
      headers: { Authorization: this.basic(), "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    });
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok) throw fromBody(res.status, body, "client token request failed");
    return { token: body.access_token, expiresIn: body.expires_in };
  }

  private async fetchToken(params: URLSearchParams): Promise<CachedToken> {
    const res = await this.fetchImpl(`${apiBase(this.cfg.env)}/v1/oauth2/token`, {
      method: "POST",
      headers: { Authorization: this.basic(), "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    });
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok) throw fromBody(res.status, body, "OAuth token request failed");
    const ttl = Math.max(60, Number(body.expires_in ?? 3600) - 300);
    return { value: body.access_token, expiresAt: Date.now() + ttl * 1000 };
  }

  async request<T = any>(method: "GET" | "POST" | "PATCH" | "DELETE", path: string, opts: { body?: unknown; requestId?: string; maxRetries?: number } = {}): Promise<T> {
    const requestId = method === "POST" ? opts.requestId ?? randomUUID() : undefined;
    const maxRetries = opts.maxRetries ?? 3;
    for (let attempt = 0; ; attempt++) {
      const headers: Record<string, string> = { Authorization: `Bearer ${await this.accessToken()}`, "Content-Type": "application/json" };
      if (requestId) headers["PayPal-Request-Id"] = requestId;
      const res = await this.fetchImpl(`${apiBase(this.cfg.env)}${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
      const text = await res.text();
      const body = text ? safeJson(text) : {};
      if (res.ok) return body as T;
      if (res.status === 401 && attempt === 0) { this.token = undefined; continue; }
      const err: PayPalError = fromBody(res.status, body);
      if (!err.isRetryable || attempt >= maxRetries) throw err;
      const retryAfter = Number(res.headers.get("retry-after"));
      await this.sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 400 + Math.random() * 200);
    }
  }
}

function safeJson(t: string) {
  try { return JSON.parse(t); } catch { return { message: t }; }
}
