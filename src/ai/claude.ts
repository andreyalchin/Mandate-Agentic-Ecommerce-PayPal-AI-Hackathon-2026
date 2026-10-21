import Anthropic from "@anthropic-ai/sdk";
import { ProxyAgent, fetch as undiciFetch } from "undici";

/** Minimal surface we use, so tests can inject a fake. */
export interface LlmClient {
  messages: { create(body: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> };
}

/**
 * Anthropic client. Key from ANTHROPIC_API_KEY, or none when running behind an
 * authenticating HTTPS proxy (Node's built-in fetch ignores HTTPS_PROXY, so route via undici).
 */
/** Dashboard pastes often carry quotes, a "Bearer " prefix or a trailing newline. */
export function cleanKey(raw?: string) {
  const k = raw?.trim().replace(/^["']|["']$/g, "").replace(/^Bearer\s+/i, "").trim();
  return k || undefined;
}
/** Non-secret description of the configured key, for /api/config diagnostics. */
export function keyKind(raw?: string) {
  const k = cleanKey(raw);
  if (!k) return "none";
  if (k.startsWith("sk-ant-api")) return "api-key";
  if (k.startsWith("sk-ant-oat")) return "oauth-token (not an API key)";
  return "unrecognized";
}

export function createClaude(env: NodeJS.ProcessEnv = process.env): Anthropic {
  const proxy = env.HTTPS_PROXY ?? env.https_proxy;
  const dispatcher = proxy ? new ProxyAgent(proxy) : undefined;
  return new Anthropic({
    apiKey: cleanKey(env.ANTHROPIC_API_KEY) ?? "proxy-injected",
    fetch: dispatcher ? ((url: any, init: any) => undiciFetch(url, { ...init, dispatcher })) as any : undefined,
    maxRetries: 3,
    timeout: 60_000,
  });
}

let cachedModel: string | undefined;
/** ANTHROPIC_MODEL if set; otherwise the newest Sonnet the key can see. */
export async function resolveModel(client: Anthropic, env: NodeJS.ProcessEnv = process.env): Promise<string> {
  if (env.ANTHROPIC_MODEL) return env.ANTHROPIC_MODEL;
  if (cachedModel) return cachedModel;
  const page = await client.models.list({ limit: 50 });
  const ids = page.data.map((m) => m.id);
  cachedModel = ids.find((i) => i.includes("sonnet")) ?? ids[0];
  if (!cachedModel) throw new Error("no Anthropic models available to this key");
  return cachedModel;
}
