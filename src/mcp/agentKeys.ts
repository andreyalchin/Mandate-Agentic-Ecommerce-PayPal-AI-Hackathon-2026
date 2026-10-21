import { createHash, randomBytes } from "node:crypto";

/**
 * Per-mandate keys for external agents (any MCP client). A key can only act through its
 * mandate, so a leaked key is bounded by the mandate's budget, categories and expiry, and
 * dies when the mandate is revoked. Only a hash is stored; the key is shown once.
 */
export interface AgentKey { id: string; mandateId: string; agentName: string; hash: string; createdAt: string; lastUsedAt?: string; revoked?: boolean }

const sha = (k: string) => createHash("sha256").update(k).digest("hex");

export class AgentKeyStore {
  private keys = new Map<string, AgentKey>();
  issue(mandateId: string, agentName: string) {
    const key = `mk_${randomBytes(24).toString("base64url")}`;
    const rec: AgentKey = { id: `key_${randomBytes(6).toString("hex")}`, mandateId, agentName: agentName.slice(0, 40), hash: sha(key), createdAt: new Date().toISOString() };
    this.keys.set(rec.hash, rec);
    return { key, record: this.public(rec) };
  }
  resolve(key: string | undefined) {
    if (!key?.startsWith("mk_")) return undefined;
    const rec = this.keys.get(sha(key));
    if (!rec || rec.revoked) return undefined;
    rec.lastUsedAt = new Date().toISOString();
    return rec;
  }
  get(id: string) { for (const k of this.keys.values()) if (k.id === id) return k; return undefined; }
  list(mandateId: string) { return [...this.keys.values()].filter((k) => k.mandateId === mandateId).map((k) => this.public(k)); }
  revoke(id: string) { for (const k of this.keys.values()) if (k.id === id) { k.revoked = true; return this.public(k); } return undefined; }
  /** Remove every key for the given mandates (session reset). */
  purge(mandateIds: Set<string>) { for (const [h, k] of this.keys) if (mandateIds.has(k.mandateId)) this.keys.delete(h); }
  dump() { return [...this.keys.values()]; }
  restore(ks: AgentKey[]) { for (const k of ks) this.keys.set(k.hash, k); }
  private public({ hash: _h, ...rest }: AgentKey) { return rest; }
}
