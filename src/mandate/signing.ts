import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify, type KeyObject } from "node:crypto";

/** Deterministic JSON: sorted keys, no whitespace. */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v as object).filter((k) => (v as any)[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as any)[k])}`).join(",")}}`;
  return JSON.stringify(v);
}

/** Ed25519 signer. Merchants or auditors verify mandates with the published public key. */
export class MandateSigner {
  private priv: KeyObject; readonly pub: KeyObject;
  constructor(privatePem?: string) {
    if (privatePem) { this.priv = createPrivateKey(privatePem); this.pub = createPublicKey(this.priv); }
    else { const k = generateKeyPairSync("ed25519"); this.priv = k.privateKey; this.pub = k.publicKey; }
  }
  sign(payload: object) { return sign(null, Buffer.from(canonical(payload)), this.priv).toString("base64url"); }
  verify(payload: object, sig: string) { return verify(null, Buffer.from(canonical(payload)), this.pub, Buffer.from(sig, "base64url")); }
  publicJwk() { return this.pub.export({ format: "jwk" }); }
}
