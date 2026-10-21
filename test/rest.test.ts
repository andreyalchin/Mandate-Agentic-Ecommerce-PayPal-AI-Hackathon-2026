import { describe, expect, it, vi } from "vitest";
import { PayPalError, PayPalRest } from "../src/paypal/index.js";
import { cfg, json } from "./helpers.js";

const tokenRes = () => json(200, { access_token: "AT", expires_in: 32400 });

describe("PayPalRest", () => {
  it("caches the access token across calls", async () => {
    const f = vi.fn(async (url: string) => (url.includes("oauth2") ? tokenRes() : json(200, { ok: 1 })));
    const r = new PayPalRest(cfg, f as any, async () => {});
    await r.request("GET", "/v1/a"); await r.request("GET", "/v1/b");
    expect(f.mock.calls.filter((c) => String(c[0]).includes("oauth2")).length).toBe(1);
  });
  it("shares one in-flight token request between concurrent calls", async () => {
    const f = vi.fn(async (url: string) => (url.includes("oauth2") ? tokenRes() : json(200, {})));
    const r = new PayPalRest(cfg, f as any, async () => {});
    await Promise.all([r.request("GET", "/x"), r.request("GET", "/y"), r.request("GET", "/z")]);
    expect(f.mock.calls.filter((c) => String(c[0]).includes("oauth2")).length).toBe(1);
  });
  it("retries 429 and 5xx with the same PayPal-Request-Id", async () => {
    const f = vi.fn().mockResolvedValueOnce(tokenRes()).mockResolvedValueOnce(json(429, { name: "RATE_LIMIT_REACHED" })).mockResolvedValueOnce(json(503, {})).mockResolvedValue(json(201, { id: "OK" }));
    const r = new PayPalRest(cfg, f as any, async () => {});
    const out = await r.request("POST", "/v2/checkout/orders", { body: {} });
    expect(out).toEqual({ id: "OK" });
    const ids = f.mock.calls.slice(1).map((c) => (c[1] as any).headers["PayPal-Request-Id"]);
    expect(new Set(ids).size).toBe(1);
    expect(ids[0]).toBeTruthy();
  });
  it("does not retry 4xx business errors and keeps debug_id", async () => {
    const f = vi.fn().mockResolvedValueOnce(tokenRes()).mockResolvedValue(json(422, { name: "UNPROCESSABLE_ENTITY", message: "declined", debug_id: "dbg123", details: [{ issue: "INSTRUMENT_DECLINED" }] }));
    const r = new PayPalRest(cfg, f as any, async () => {});
    const err = await r.request("POST", "/v2/x", { body: {} }).catch((e) => e);
    expect(err).toBeInstanceOf(PayPalError);
    expect(err.debugId).toBe("dbg123");
    expect(err.isInstrumentDeclined).toBe(true);
    expect(f).toHaveBeenCalledTimes(2);
  });
  it("refreshes the token once on 401", async () => {
    const f = vi.fn().mockResolvedValueOnce(tokenRes()).mockResolvedValueOnce(json(401, {})).mockResolvedValueOnce(tokenRes()).mockResolvedValue(json(200, { ok: true }));
    const r = new PayPalRest(cfg, f as any, async () => {});
    expect(await r.request("GET", "/v1/a")).toEqual({ ok: true });
  });
  it("requests a browser-safe client token scoped to domains", async () => {
    const f = vi.fn().mockResolvedValue(json(200, { access_token: "CT", expires_in: 900 }));
    const r = new PayPalRest(cfg, f as any);
    const t = await r.clientToken(["localhost"]);
    expect(t.token).toBe("CT");
    const body = String((f.mock.calls[0][1] as any).body);
    expect(body).toContain("response_type=client_token");
    expect(body).toContain("domains%5B%5D=localhost");
  });
});
