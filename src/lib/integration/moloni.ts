import "server-only";
import { IntegrationError, withLog } from "./log";

// Cliente da API REST do Moloni (https://www.moloni.pt/dev/).
// Autenticação OAuth2: grant "password" na primeira vez e "refresh_token"
// quando o access token expira (validade de 1 h).

const API = "https://api.moloni.pt/v1";
const TIMEOUT_MS = 30_000;

type Token = { access: string; refresh: string; expiresAt: number };
let token: Token | null = null;

function env(name: string) {
  const v = process.env[name];
  if (!v) throw new IntegrationError("Moloni", `Ligação ao Moloni não configurada: falta ${name} no .env.`);
  return v;
}

export function moloniIds() {
  return {
    company_id: Number(env("MOLONI_COMPANY_ID")),
    document_set_id: Number(env("MOLONI_DOCUMENT_SET_ID")),
    tax_id: Number(env("MOLONI_TAX_ID")),
    unit_id: Number(env("MOLONI_UNIT_ID")),
  };
}

async function requestToken(grant: "password" | "refresh_token"): Promise<Token> {
  const params = new URLSearchParams({
    grant_type: grant,
    client_id: env("MOLONI_CLIENT_ID"),
    client_secret: env("MOLONI_CLIENT_SECRET"),
  });
  if (grant === "password") {
    params.set("username", env("MOLONI_USERNAME"));
    params.set("password", env("MOLONI_PASSWORD"));
  } else {
    params.set("refresh_token", token!.refresh);
  }

  let newToken: Token | null = null;
  // O log guarda só a validade: os tokens nunca vão para o IntegrationLog
  await withLog({ system: "Moloni", operation: `POST grant (${grant})`, reference: "Token" }, async () => {
    const res = await fetch(`${API}/grant/?${params}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.access_token) {
      const detail = json?.error_description ?? json?.error;
      throw new IntegrationError("Moloni", `Autenticação no Moloni falhou${detail ? `: ${detail}` : "."}`, res.status, JSON.stringify({ error: json?.error, error_description: json?.error_description }));
    }
    newToken = {
      access: json.access_token,
      refresh: json.refresh_token,
      // Renovamos 60 s antes de expirar para evitar pedidos com token caducado
      expiresAt: Date.now() + (json.expires_in - 60) * 1000,
    };
    return { expires_in: json.expires_in };
  });
  return newToken!;
}

// Um pedido de token novo invalida o anterior, por isso pedidos em paralelo têm
// de partilhar o mesmo: senão, o último a chegar deixa os outros sem token válido.
let pendingToken: Promise<Token> | null = null;

async function renewToken(): Promise<Token> {
  try {
    return await requestToken(token ? "refresh_token" : "password");
  } catch (err) {
    // Se o refresh token também expirou, volta a autenticar com password
    if (!token) throw err;
    return requestToken("password");
  }
}

async function accessToken(): Promise<string> {
  if (token && Date.now() < token.expiresAt) return token.access;
  pendingToken ??= renewToken().finally(() => {
    pendingToken = null;
  });
  token = await pendingToken;
  return token.access;
}

/** Estado do token, para o monitor de integração. */
export function tokenStatus() {
  return token ? { expiresInMs: token.expiresAt - Date.now() } : null;
}

/**
 * Chama um endpoint do Moloni, ex.: moloniCall("customers/insert", {...}).
 * Com "?json=true" o Moloni aceita o corpo em JSON. Os pedidos "getAll"
 * respondem com uma lista; os erros vêm como lista de { code, description },
 * como lista de texto (["8 vat"]), como { valid: 0 } ou como { error }.
 */
export async function moloniCall<T>(endpoint: string, data: Record<string, unknown> = {}): Promise<T> {
  const send = async () =>
    fetch(`${API}/${endpoint}/?access_token=${await accessToken()}&json=true`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

  let res: Response;
  let text: string;
  try {
    res = await send();
    text = await res.text();
    // O token pode ter sido invalidado por outro login: pede outro e repete uma vez
    if (text.includes("Invalid access token")) {
      token = null;
      res = await send();
      text = await res.text();
    }
  } catch (err) {
    if (err instanceof IntegrationError) throw err;
    const timeout = err instanceof Error && err.name === "TimeoutError";
    throw new IntegrationError(
      "Moloni",
      timeout ? `O Moloni não respondeu em ${TIMEOUT_MS / 1000} s.` : "Falha de rede ao contactar o Moloni.",
    );
  }

  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {}

  const invalid = isErrorList(json) || isCodeList(json) || (!!json && typeof json === "object" && !Array.isArray(json) &&
    (("valid" in json && (json as { valid: number }).valid === 0) || "error" in json));
  if (!res.ok || invalid) {
    throw new IntegrationError("Moloni", describeMoloniError(json) ?? `Moloni respondeu ${res.status}`, res.status, text);
  }
  return json as T;
}

// Lista de erros de validação: [{ code, description }] (uma lista de dados,
// ex.: empresas, não tem estes campos)
function isErrorList(json: unknown): json is { code: string; field?: string; description: string }[] {
  return Array.isArray(json) && json.length > 0 && json.every((e) => e && typeof e === "object" && "code" in e && "description" in e);
}

// Erros curtos, como ["8 vat"]: um código e o campo. Uma lista de dados nunca traz só texto
function isCodeList(json: unknown): json is string[] {
  return Array.isArray(json) && json.length > 0 && json.every((e) => typeof e === "string" && /^\d+\s+\S+/.test(e));
}

function describeMoloniError(json: unknown): string | null {
  if (isCodeList(json)) return `O Moloni recusou os campos: ${json.map((e) => e.split(/\s+/)[1]).join(", ")} (${json.join("; ")})`;
  if (isErrorList(json)) return json.map((e) => [e.field, e.description].filter(Boolean).join(": ")).join("; ");
  if (json && typeof json === "object" && "error" in json) {
    const j = json as { error: string; error_description?: string };
    return j.error_description ?? j.error;
  }
  return null;
}
