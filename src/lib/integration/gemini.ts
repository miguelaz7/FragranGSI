import "server-only";
import { IntegrationError, withLog } from "./log";

// Cliente da API Gemini (Google AI Studio), usado pelo assistente de perfumes.
// A chave fica só no .env (GEMINI_API_KEY) e vai num cabeçalho, nunca no log.

const API = "https://generativelanguage.googleapis.com/v1beta";
const TIMEOUT_MS = 30_000;

export function geminiConfigured() {
  return !!process.env.GEMINI_API_KEY;
}

export type ChatMessage = { role: "user" | "model"; text: string };

/** Pedido ao generateContent: trata erros, timeout e registo no IntegrationLog. Devolve o texto da resposta. */
async function generate(payload: object, reference: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new IntegrationError("IA", "Assistente IA não configurado: falta GEMINI_API_KEY no .env.");
  const model = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

  return withLog({ system: "IA", operation: `POST ${model}:generateContent`, reference }, async () => {
    let res: Response;
    try {
      res = await fetch(`${API}/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      const timeout = err instanceof Error && err.name === "TimeoutError";
      throw new IntegrationError("IA", timeout ? `O Gemini não respondeu em ${TIMEOUT_MS / 1000} s.` : "Falha de rede ao contactar o Gemini.");
    }

    const body = await res.text();
    if (!res.ok) {
      let msg = `Gemini respondeu ${res.status}`;
      try {
        msg = JSON.parse(body).error?.message ?? msg;
      } catch {}
      throw new IntegrationError("IA", msg, res.status, body);
    }

    const text: string | undefined = JSON.parse(body).candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("");
    if (!text) throw new IntegrationError("IA", "O Gemini devolveu uma resposta vazia.", res.status, body);
    return text;
  });
}

/**
 * Pede ao Gemini uma resposta em JSON com o formato `schema` (subconjunto de
 * OpenAPI aceite pela API: OBJECT, ARRAY, STRING…). Devolve o JSON já lido.
 */
export async function geminiJson<T>(opts: { system: string; prompt: string; schema: object; reference?: string }): Promise<T> {
  const text = await generate(
    {
      systemInstruction: { parts: [{ text: opts.system }] },
      contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: opts.schema, temperature: 0.4 },
    },
    opts.reference ?? "Assistente",
  );
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new IntegrationError("IA", "O Gemini não devolveu JSON válido.");
  }
}

/** Conversa com histórico (Analista IA): devolve a resposta em texto. */
export async function geminiChat(opts: { system: string; messages: ChatMessage[]; reference?: string }): Promise<string> {
  return generate(
    {
      systemInstruction: { parts: [{ text: opts.system }] },
      contents: opts.messages.map((m) => ({ role: m.role, parts: [{ text: m.text }] })),
      generationConfig: { temperature: 0.3 },
    },
    opts.reference ?? "Analista",
  );
}
