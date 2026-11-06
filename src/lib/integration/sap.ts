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

/** Envia com o token guardado. Se expirou (403), obtém outro e repete uma vez. */
async function withCsrf(service: string, send: (csrf: Csrf) => Promise<Response>) {
  const res = await send(csrfCache.get(service) ?? (await fetchCsrf(service)));
  if (res.status === 403 && res.headers.get("x-csrf-token")?.toLowerCase() === "required") {
    return send(await fetchCsrf(service));
  }
  return res;
}

type WriteOptions = {
  query?: Record<string, string>;
  body?: unknown;
  headers?: Record<string, string>;
  // O SAP pode responder 200 e indicar um erro no cabeçalho "sap-message"
  failOnMessage?: boolean;
};

/**
 * Escrita com token CSRF (POST, PATCH ou DELETE).
 * Devolve o conteúdo de "d", ou null se vier vazio.
 */
async function sapWrite<T>(method: string, service: string, path: string, options: WriteOptions = {}): Promise<T> {
  const { query, body, headers, failOnMessage } = options;
  const url = buildUrl(service, path, query);
  // Só os function imports aceitam $format: nos outros dá HTTP 400 e o JSON vem pelo Accept
  if (body !== undefined || method === "DELETE") url.searchParams.delete("$format");

  const send = (csrf: Csrf) =>
    fetch(url, {
      method,
      headers: {
        Authorization: config().auth,
        Accept: "application/json",
        ...(body !== undefined && { "Content-Type": "application/json" }),
        "x-csrf-token": csrf.token,
        Cookie: csrf.cookies,
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

  try {
    const res = await withCsrf(service, send);
    if (!res.ok) throw await parseError(res);
    if (failOnMessage) throwOnSapMessage(res);
    const text = await res.text();
    return (text ? JSON.parse(text).d : null) as T;
  } catch (err) {
    asIntegrationError(err);
  }
}

function throwOnSapMessage(res: Response) {
  const header = res.headers.get("sap-message");
  if (!header) return;
  let message: { severity?: string; message?: string } | null = null;
  try {
    message = JSON.parse(header);
  } catch {}
  if (message?.severity === "error") {
    throw new IntegrationError("SAP", message.message ?? "O SAP devolveu um erro de validação.", res.status, header);
  }
}

/** POST com token CSRF: criar entidades (com "body") ou chamar function imports (com "query"). */
export function sapPost<T>(service: string, path: string, options?: WriteOptions): Promise<T> {
  return sapWrite<T>("POST", service, path, options);
}

/** Altera campos de uma entidade (If-Match: * = não comparar versões). */
export function sapPatch(service: string, path: string, body: unknown): Promise<null> {
  return sapWrite<null>("PATCH", service, path, { body, headers: { "If-Match": "*" } });
}

export function sapDelete(service: string, path: string): Promise<null> {
  return sapWrite<null>("DELETE", service, path, { headers: { "If-Match": "*" } });
}

/**
 * Executa vários POST num único $batch, no mesmo changeset: ou correm todos ou
 * nenhum. Devolve o "d" da última resposta. O $batch responde 202 mesmo quando
 * uma operação falha, por isso o resultado de cada uma vem dentro do corpo.
 */
export async function sapBatch<T>(service: string, paths: string[]): Promise<T> {
  const part = (path: string) =>
    `--changeset\r\nContent-Type: application/http\r\nContent-Transfer-Encoding: binary\r\n\r\n` +
    `POST ${path} HTTP/1.1\r\nAccept: application/json\r\nContent-Length: 0\r\n\r\n\r\n`;
  const body =
    `--batch\r\nContent-Type: multipart/mixed; boundary=changeset\r\n\r\n` +
    `${paths.map(part).join("")}--changeset--\r\n--batch--\r\n`;

  const url = buildUrl(service, "$batch");
  url.searchParams.delete("$format");

  try {
    const res = await withCsrf(service, (csrf) =>
      fetch(url, {
        method: "POST",
        headers: {
          Authorization: config().auth,
          Accept: "multipart/mixed",
          "Content-Type": "multipart/mixed; boundary=batch",
          "x-csrf-token": csrf.token,
          Cookie: csrf.cookies,
        },
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }),
    );
    if (!res.ok) throw await parseError(res);

    const text = await res.text();
    const statuses = [...text.matchAll(/HTTP\/1\.1 (\d{3})/g)].map((m) => Number(m[1]));
    // Cada resposta traz o seu JSON numa linha própria
    const results = text.split(/\r?\n/).filter((line) => line.startsWith("{")).map((line) => JSON.parse(line));

    const failed = statuses.find((status) => status >= 400);
    if (failed || statuses.length === 0) {
      const message = results.find((r) => r.error)?.error?.message?.value ?? "O SAP não executou o $batch.";
      throw new IntegrationError("SAP", message, failed, text);
    }
    return results.at(-1)?.d as T;
  } catch (err) {
    asIntegrationError(err);
  }
}
