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

  return withLog({ system: "Moloni", operation: `POST grant (${grant})`, reference: "Token" }, async () => {
    const res = await fetch(`${API}/grant/?${params}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.access_token) {
      throw new IntegrationError("Moloni", "Autenticação no Moloni falhou.", res.status, JSON.stringify(json));
    }
    return {
      access: json.access_token,
      refresh: json.refresh_token,
      // Renovamos 60 s antes de expirar para evitar pedidos com token caducado
      expiresAt: Date.now() + (json.expires_in - 60) * 1000,
    };
  });
}

async function accessToken(): Promise<string> {
  if (token && Date.now() < token.expiresAt) return token.access;
  try {
    token = await requestToken(token ? "refresh_token" : "password");
  } catch (err) {
    // Se o refresh token também expirou, volta a autenticar com password
    if (!token) throw err;
    token = await requestToken("password");
  }
  return token.access;
}

/** Estado do token, para o monitor de integração. */
export function tokenStatus() {
  return token ? { expiresInMs: token.expiresAt - Date.now() } : null;
}

/**
 * Chama um endpoint do Moloni, ex.: moloniCall("customers/insert", {...}).
 * Com "?json=true" o Moloni aceita o corpo em JSON. Devolve erros
 * como lista de { field, message } (ou { valid: 0 }).
 */
export async function moloniCall<T>(endpoint: string, data: Record<string, unknown> = {}): Promise<T> {
  const access = await accessToken();
  let res: Response;
  try {
    res = await fetch(`${API}/${endpoint}/?access_token=${access}&json=true`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const timeout = err instanceof Error && err.name === "TimeoutError";
    throw new IntegrationError(
      "Moloni",
      timeout ? `O Moloni não respondeu em ${TIMEOUT_MS / 1000} s.` : "Falha de rede ao contactar o Moloni.",
    );
  }

  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {}

  const invalid =
    Array.isArray(json) || (json && typeof json === "object" && "valid" in json && (json as { valid: number }).valid === 0);
  if (!res.ok || invalid) {
    throw new IntegrationError("Moloni", describeMoloniError(json) ?? `Moloni respondeu ${res.status}`, res.status, text);
  }
  return json as T;
}

function describeMoloniError(json: unknown): string | null {
  // Erros de validação: [{ code, field, description }]
  if (Array.isArray(json) && json.length) {
    return json.map((e) => [e.field, e.description ?? e.message].filter(Boolean).join(": ")).join("; ");
  }
  return null;
}
