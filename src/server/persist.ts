import fs from "node:fs";
import path from "node:path";
import { generateKeyPairSync } from "node:crypto";
import type { MandateService } from "../mandate/service.js";
import type { WalletStore } from "./walletStore.js";
import { shelves } from "../catalog/shop.js";

/**
 * Demo-scale persistence: one JSON snapshot in DATA_DIR, written when state changes.
 * Keeps mandates, receipts and linked wallets across restarts of a single instance.
 * (A production build would use a database; vault ids would sit in an encrypted column.)
 */
export function signingKeyPem(dir: string): string {
  if (process.env.MANDATE_SIGNING_KEY) return process.env.MANDATE_SIGNING_KEY.replace(/\\n/g, "\n");
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, "signing-key.pem");
  if (!fs.existsSync(f)) fs.writeFileSync(f, generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" }) as string, { mode: 0o600 });
  return fs.readFileSync(f, "utf8");
}

export function attachPersistence(dir: string, svc: MandateService, wallets: WalletStore, everyMs = 1500) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "state.json");
  if (fs.existsSync(file)) {
    const s = JSON.parse(fs.readFileSync(file, "utf8"));
    wallets.restore(s.wallets ?? []);
    for (const m of s.mandates ?? []) svc.mandates.set(m.id, m);
    for (const c of s.carts ?? []) svc.carts.set(c.id, c);
    for (const r of s.receipts ?? []) svc.receipts.set(r.id, r);
    svc.log.push(...(s.log ?? [])); shelves.restore(s.shelves ?? []);
    console.log(`[persist] restored ${svc.mandates.size} mandates, ${svc.receipts.size} receipts from ${file}`);
  }
  let last = "";
  const save = () => {
    const snap = JSON.stringify({ v: 1, wallets: wallets.dump(), mandates: [...svc.mandates.values()], carts: [...svc.carts.values()], receipts: [...svc.receipts.values()], log: svc.log.slice(-1000), shelves: shelves.dump().filter(([k]) => svc.mandates.has(k)) });
    if (snap === last) return;
    const tmp = `${file}.tmp`; fs.writeFileSync(tmp, snap, { mode: 0o600 }); fs.renameSync(tmp, file); last = snap;
  };
  const t = setInterval(save, everyMs); t.unref();
  for (const sig of ["SIGTERM", "SIGINT"] as const) process.once(sig, () => { try { save(); } finally { process.exit(0); } });
  return save;
}
