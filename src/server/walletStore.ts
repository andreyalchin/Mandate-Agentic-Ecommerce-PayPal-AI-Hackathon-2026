import { randomUUID } from "node:crypto";

/**
 * Server-side store for PayPal payment tokens (vault ids). PayPal recommends never
 * returning vault ids to the browser; clients and agents get an opaque walletRef instead.
 * In-memory for the demo; swap for a database in deployment.
 */
export interface SavedWallet { walletRef: string; vaultId: string; customerId?: string; createdAt: string; label?: string }

export class WalletStore {
  private byRef = new Map<string, SavedWallet>();
  save(vaultId: string, customerId?: string, label?: string): SavedWallet {
    const w = { walletRef: `wal_${randomUUID().replace(/-/g, "").slice(0, 20)}`, vaultId, customerId, label, createdAt: new Date().toISOString() };
    this.byRef.set(w.walletRef, w);
    return w;
  }
  get(walletRef: string) { return this.byRef.get(walletRef); }
  /** Public view (no vault ids), newest first. */
  list() { return [...this.byRef.values()].reverse().map(({ walletRef, label, createdAt }) => ({ walletRef, label, createdAt })); }
  delete(walletRef: string) { return this.byRef.delete(walletRef); }
  dump() { return [...this.byRef.values()]; }
  restore(ws: SavedWallet[]) { for (const w of ws) this.byRef.set(w.walletRef, w); }
}
