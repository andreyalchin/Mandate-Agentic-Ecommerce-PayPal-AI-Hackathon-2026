import { ApiError } from "@paypal/paypal-server-sdk";

/** Normalized PayPal error that always carries debug_id for support escalation. */
export class PayPalError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly name_: string | undefined,
    public readonly debugId: string | undefined,
    public readonly issues: string[] = [],
    public readonly raw?: unknown,
  ) {
    super(message);
    this.name = "PayPalError";
  }
  /** Buyer's funding source was declined: ask for another method, never auto-retry. */
  get isInstrumentDeclined() {
    return this.issues.includes("INSTRUMENT_DECLINED") || this.issues.includes("PAYER_ACTION_REQUIRED");
  }
  get isRetryable() {
    return this.status === 429 || this.status >= 500;
  }
  toJSON() {
    return { error: this.name_ ?? "PAYPAL_ERROR", message: this.message, status: this.status, debug_id: this.debugId, issues: this.issues };
  }
}

export function fromBody(status: number, body: any, fallback = "PayPal request failed"): PayPalError {
  const issues: string[] = Array.isArray(body?.details) ? body.details.map((d: any) => d?.issue).filter(Boolean) : [];
  return new PayPalError(body?.message ?? body?.error_description ?? fallback, status, body?.name ?? body?.error, body?.debug_id, issues, body);
}

export function normalizeError(err: unknown): PayPalError {
  if (err instanceof PayPalError) return err;
  if (err instanceof ApiError) {
    let body: any = err.result;
    if (!body && typeof err.body === "string") {
      try { body = JSON.parse(err.body); } catch { body = { message: err.body }; }
    }
    return fromBody(err.statusCode, body ?? {}, err.message);
  }
  const e = err as Error;
  return new PayPalError(e?.message ?? String(err), 0, "NETWORK_ERROR", undefined, [], err);
}
