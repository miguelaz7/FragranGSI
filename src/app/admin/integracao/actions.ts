"use server";

import { refresh, updateTag } from "next/cache";
import { db } from "@/lib/db";
import { getCatalog } from "@/lib/catalog";
import { sapGet } from "@/lib/integration/sap";
import { moloniCall } from "@/lib/integration/moloni";
import { withLog } from "@/lib/integration/log";

// Ações do monitor de integração. Os erros não são relançados: cada chamada
// já fica registada no IntegrationLog por withLog() e aparece na tabela.
// TODO(Auth0): confirmar que quem chama é admin (getCurrentUser) antes de executar.

/** Força nova leitura de produtos, stock e preços no SAP. */
async function syncCatalog() {
  updateTag("catalogo"); // a cache do catálogo deixa de valer
  await getCatalog(); // e é lida já de novo do SAP
}

// "Tentar novamente": cada operação repetível tem aqui a sua função,
// identificada pelo retryAction guardado no registo do erro.
const RETRY_HANDLERS: Record<string, (payload: unknown) => Promise<void>> = {
  "sync-catalogo": syncCatalog,
};

export async function canRetry(action: string | null) {
  return !!action && action in RETRY_HANDLERS;
}

export async function syncCatalogNow() {
  try {
    await syncCatalog();
  } catch {}
  refresh();
}

export async function testSap() {
  try {
    await withLog({ system: "SAP", operation: "GET UI_PRODUCTLIST (service document)", reference: "Teste de ligação" }, () =>
      sapGet<{ EntitySets: string[] }>("UI_PRODUCTLIST", ""),
    );
  } catch {}
  refresh();
}

export async function testMoloni() {
  try {
    // Pedido simples que exige token válido: confirma credenciais e acesso à API
    await withLog({ system: "Moloni", operation: "POST companies/getAll", reference: "Teste de ligação" }, () =>
      moloniCall("companies/getAll"),
    );
  } catch {}
  refresh();
}

export async function retryLog(formData: FormData) {
  const log = await db.integrationLog.findUnique({ where: { id: String(formData.get("id")) } });
  const handler = log?.retryAction ? RETRY_HANDLERS[log.retryAction] : undefined;
  if (!log || log.status !== "Erro" || !handler) return;

  try {
    await handler(log.retryPayload ? JSON.parse(log.retryPayload) : null);
    // Funcionou: o erro original fica marcado como resolvido
    await db.integrationLog.update({ where: { id: log.id }, data: { status: "Resolvido" } });
  } catch {
    // Voltou a falhar: a nova tentativa já ficou registada como um novo erro
  }
  refresh();
}

/** Fecha um erro à mão (ex.: credenciais corrigidas no .env). Fica registado no próprio log. */
export async function markResolved(formData: FormData) {
  const log = await db.integrationLog.findUnique({ where: { id: String(formData.get("id")) } });
  if (!log || log.status !== "Erro") return;
  const when = new Date().toLocaleString("pt-PT", { timeZone: "Europe/Lisbon" });
  await db.integrationLog.update({
    where: { id: log.id },
    data: { status: "Resolvido", message: `${log.message ?? ""}\n— Marcado como resolvido manualmente em ${when}.`.trim() },
  });
  refresh();
}
