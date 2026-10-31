import "server-only";
import { IntegrationError } from "./log";

// Cliente genérico para os serviços OData v2 do SAP S/4HANA.
// Usa autenticação básica; as credenciais vêm só do .env.

const TIMEOUT_MS = 30_000;

function config() {
  const { SAP_BASE_URL, SAP_USER, SAP_PASSWORD, SAP_CLIENT } = process.env;
  if (!SAP_BASE_URL || !SAP_USER || !SAP_PASSWORD) {
    throw new IntegrationError("SAP", "Ligação ao SAP não configurada (ver .env).");
  }
  return {
    baseUrl: SAP_BASE_URL.replace(/\/$/, ""),
    auth: "Basic " + Buffer.from(`${SAP_USER}:${SAP_PASSWORD}`).toString("base64"),
    client: SAP_CLIENT,
  };
}

function buildUrl(service: string, path: string, query: Record<string, string> = {}) {
  const { baseUrl, client } = config();
  const url = new URL(`${baseUrl}/${service}/${path.replace(/^\//, "")}`);
  url.searchParams.set("$format", "json");
  if (client) url.searchParams.set("sap-client", client);
  // As descrições dos produtos são guardadas por idioma; os nossos estão em português
  url.searchParams.set("sap-language", "PT");
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return url;
}

// --- Token CSRF ---
// O SAP exige um token CSRF em POST/PATCH/DELETE. Obtém-se com um GET que
// leva "x-csrf-token: fetch"; o token só é válido com os cookies de sessão
// devolvidos nessa resposta, por isso guardamos os dois por serviço.
type Csrf = { token: string; cookies: string };
const csrfCache = new Map<string, Csrf>();

async function fetchCsrf(service: string): Promise<Csrf> {
  const res = await fetch(buildUrl(service, ""), {
    headers: { Authorization: config().auth, "x-csrf-token": "fetch" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const token = res.headers.get("x-csrf-token");
  if (!res.ok || !token) {
    throw new IntegrationError("SAP", `Não foi possível obter token CSRF (${res.status}).`, res.status);
  }
  const cookies = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  const csrf = { token, cookies };
  csrfCache.set(service, csrf);
  return csrf;
}

async function parseError(res: Response): Promise<IntegrationError> {
  const body = await res.text();
  let message = `SAP respondeu ${res.status}`;
  try {
    // Formato de erro OData v2: { error: { message: { value } } }
    const json = JSON.parse(body);
    message = json?.error?.message?.value ?? message;
  } catch {}
  return new IntegrationError("SAP", message, res.status, body);
}

function asIntegrationError(err: unknown): never {
  if (err instanceof IntegrationError) throw err;
  if (err instanceof Error && err.name === "TimeoutError") {
    throw new IntegrationError("SAP", `O SAP não respondeu em ${TIMEOUT_MS / 1000} s.`);
  }
  throw new IntegrationError("SAP", `Falha de rede ao contactar o SAP: ${(err as Error).message}`);
}

/** GET a uma entidade/coleção OData. Devolve o conteúdo de "d". */
export async function sapGet<T>(service: string, path: string, query?: Record<string, string>): Promise<T> {
  try {
    const res = await fetch(buildUrl(service, path, query), {
      headers: { Authorization: config().auth, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) throw await parseError(res);
    const json = await res.json();
    return json.d as T;
  } catch (err) {
    asIntegrationError(err);
  }
}

/** POST com token CSRF. Se o token expirou (403), obtém outro e repete uma vez. */
export async function sapPost<T>(
  service: string,
  path: string,
  body: unknown = {},
  query?: Record<string, string>,
): Promise<T> {
  const send = async (csrf: Csrf) =>
    fetch(buildUrl(service, path, query), {
      method: "POST",
      headers: {
        Authorization: config().auth,
        Accept: "application/json",
        "Content-Type": "application/json",
        "x-csrf-token": csrf.token,
        Cookie: csrf.cookies,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

  try {
    let res = await send(csrfCache.get(service) ?? (await fetchCsrf(service)));
    if (res.status === 403 && res.headers.get("x-csrf-token")?.toLowerCase() === "required") {
      res = await send(await fetchCsrf(service));
    }
    if (!res.ok) throw await parseError(res);
    const text = await res.text();
    return (text ? JSON.parse(text).d : null) as T;
  } catch (err) {
    asIntegrationError(err);
  }
}
