import { Client, Environment, LogLevel } from "@paypal/paypal-server-sdk";

export type PayPalEnv = "sandbox" | "production";

export interface PayPalConfig {
  clientId: string;
  clientSecret: string;
  env: PayPalEnv;
  webhookId?: string;
  publicOrigin: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): PayPalConfig {
  const clientId = env.PAYPAL_CLIENT_ID?.trim();
  const clientSecret = env.PAYPAL_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error("PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET must be set (see .env.example)");
  }
  const mode = (env.PAYPAL_ENV ?? "sandbox") as PayPalEnv;
  if (mode !== "sandbox" && mode !== "production") throw new Error(`PAYPAL_ENV must be sandbox or production, got ${mode}`);
  return {
    clientId,
    clientSecret,
    env: mode,
    webhookId: env.PAYPAL_WEBHOOK_ID?.trim() || undefined,
    publicOrigin: env.PUBLIC_ORIGIN ?? env.RENDER_EXTERNAL_URL ?? `http://localhost:${env.PORT ?? 8787}`,
  };
}

export const apiBase = (env: PayPalEnv) =>
  env === "production" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";

export const webSdkUrl = (env: PayPalEnv) =>
  env === "production" ? "https://www.paypal.com/web-sdk/v6/core" : "https://www.sandbox.paypal.com/web-sdk/v6/core";

/** PayPal TypeScript Server SDK client. The SDK caches and refreshes the OAuth token itself. */
export function createSdkClient(cfg: PayPalConfig): Client {
  return new Client({
    clientCredentialsAuthCredentials: { oAuthClientId: cfg.clientId, oAuthClientSecret: cfg.clientSecret },
    environment: cfg.env === "production" ? Environment.Production : Environment.Sandbox,
    timeout: 15000,
    // Honor HTTPS_PROXY (e.g. a credential-injecting proxy in development).
    httpClientOptions: process.env.HTTPS_PROXY ? { proxySettings: { address: process.env.HTTPS_PROXY } } : undefined,
    logging: { logLevel: LogLevel.Warn, logRequest: { logBody: false }, logResponse: { logHeaders: true } },
  });
}
