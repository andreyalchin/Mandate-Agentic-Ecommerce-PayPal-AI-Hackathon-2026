// AG Studio LLM adapter for Claude. AG Studio's Agent Framework calls executeTurn() with its own
// conversation items; the server endpoint /api/studio/turn translates to the Anthropic Messages
// API (key stays server-side) and returns AG Studio output items, which we replay as events.
import type { AgAiEvent, AgLlmAdapter, AgLlmRequest, AgLlmResponse } from "ag-studio";

export function claudeAdapter(endpoint = "/api/studio/turn"): AgLlmAdapter {
  return {
    executeTurn(request: AgLlmRequest, options?: { signal?: AbortSignal }) {
      let resolve!: (r: AgLlmResponse) => void, reject!: (e: unknown) => void;
      const complete = new Promise<AgLlmResponse>((a, b) => { resolve = a; reject = b; });
      complete.catch(() => {});
      async function* events(): AsyncGenerator<AgAiEvent> {
        try {
          const res = await fetch(endpoint, {
            method: "POST", headers: { "content-type": "application/json" }, signal: options?.signal,
            body: JSON.stringify({ input: request.input, instructions: request.instructions, tools: request.tools, toolChoice: request.toolChoice, responseFormat: request.responseFormat }),
          });
          const body = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(body?.message ?? `Claude request failed (${res.status})`);
          const response = body as AgLlmResponse;
          for (const item of response.output as any[]) {
            if (item.type === "message") {
              yield { type: "TEXT_MESSAGE_START", messageId: item.id, role: "assistant" } as AgAiEvent;
              const text = item.content.map((c: any) => c.text ?? "").join("");
              // Replay in small chunks so the chat panel types it out.
              for (let i = 0; i < text.length; i += 48) yield { type: "TEXT_MESSAGE_CONTENT", messageId: item.id, delta: text.slice(i, i + 48) } as AgAiEvent;
              yield { type: "TEXT_MESSAGE_END", messageId: item.id } as AgAiEvent;
            } else if (item.type === "function_call") {
              yield { type: "TOOL_CALL_START", toolCallId: item.callId, toolCallName: item.name } as AgAiEvent;
              yield { type: "TOOL_CALL_ARGS", toolCallId: item.callId, delta: item.arguments } as AgAiEvent;
              yield { type: "TOOL_CALL_END", toolCallId: item.callId } as AgAiEvent;
            }
          }
          resolve(response);
        } catch (e) { reject(e); throw e; }
      }
      const it = events();
      return { stream: { [Symbol.asyncIterator]: () => it }, complete };
    },
  };
}
