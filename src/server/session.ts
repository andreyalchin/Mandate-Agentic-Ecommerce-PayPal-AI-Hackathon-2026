import { randomBytes } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import type { MandateService } from "../mandate/service.js";
import type { WalletStore } from "./walletStore.js";
import type { AgentKeyStore } from "../mcp/agentKeys.js";

/**
 * Anonymous per-browser sessions. Every visitor (each judge) gets an httpOnly cookie, and
 * wallets, mandates, approvals, receipts and activity are visible only to that owner.
 * Outside agents don't use the cookie: they hold a per-mandate MCP key instead.
 */
export const COOKIE = "mandate_sid";
export type OwnerOf = (req: Request, res: Response) => string;

export function cookieOwner(secure: boolean): OwnerOf {
  return (req, res) => {
    const m = /(?:^|;\s*)mandate_sid=([A-Za-z0-9_-]{20,64})/.exec(req.headers.cookie ?? "");
    if (m) return m[1];
    const sid = randomBytes(18).toString("base64url");
    res.append("Set-Cookie", `${COOKIE}=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${90 * 86400}${secure ? "; Secure" : ""}`);
    return sid;
  };
}

declare module "express-serve-static-core" { interface Request { owner?: string } }

const notFound = (res: Response) => res.status(404).json({ error: "NOT_FOUND" });

/** Attaches req.owner and rejects any reference to another owner's objects (as 404). */
export function ownership(ownerOf: OwnerOf, svc: MandateService, wallets: WalletStore, keys: AgentKeyStore) {
  const ownsMandate = (owner: string, id?: unknown) => typeof id === "string" && svc.mandates.get(id)?.userId === owner;
  const ownsWallet = (owner: string, ref?: unknown) => typeof ref === "string" && wallets.get(ref)?.owner === owner;
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.path.startsWith("/api/") || req.path.startsWith("/api/webhooks/")) return next();
    const owner = (req.owner = ownerOf(req, res));
    const p = req.path.split("/"); // ["", "api", resource, id, action]
    const [resource, id] = [p[2], p[3]];
    if (resource === "mandates" && id && id !== "draft" && id !== "preview" && !ownsMandate(owner, id)) return notFound(res);
    if (resource === "cart-mandates" && id && !ownsMandate(owner, svc.carts.get(id)?.mandateId)) return notFound(res);
    if (resource === "receipts" && id && !ownsMandate(owner, svc.receipts.get(id)?.mandateId)) return notFound(res);
    if (resource === "agent-keys" && id && !ownsMandate(owner, keys.get(id)?.mandateId)) return notFound(res);
    const mandateId = req.body?.mandateId ?? req.query.mandateId;
    if (mandateId !== undefined && !ownsMandate(owner, mandateId)) return notFound(res);
    const walletRef = req.body?.walletRef;
    // Drafting and previewing happen before PayPal is linked; they never touch money, so "pending" is allowed there only.
    const unlinkedOk = walletRef === "pending" && req.method === "POST" && (req.path === "/api/mandates/draft" || req.path === "/api/mandates/preview");
    if (walletRef !== undefined && !unlinkedOk && !ownsWallet(owner, walletRef)) return notFound(res);
    // Mandates always belong to the session that signs them.
    if (req.method === "POST" && (req.path === "/api/mandates" || req.path === "/api/mandates/draft") && req.body && typeof req.body === "object") req.body.userId = owner;
    next();
  };
}
