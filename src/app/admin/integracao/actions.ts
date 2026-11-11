"use server";

import { refresh, updateTag } from "next/cache";
import { db } from "@/lib/db";
import { sapGet } from "@/lib/integration/sap";
import { moloniCall } from "@/lib/integration/moloni";
import { withLog } from "@/lib/integration/log";
import { retryCustomerMoloni, retryCustomerMoloniUpdate, retryCustomerSap, retryCustomerSapUpdate } from "@/lib/customers";
import { retryPrice } from "@/lib/prices";
import { retryMaterial } from "@/lib/products";
import { retryStockEntry } from "@/lib/stock";
import { runFullSync, syncCatalog } from "@/lib/sync";

// Ações do monitor de integração. Os erros não são relançados: cada chamada
// já fica registada no IntegrationLog por withLog() e aparece na tabela.
// TODO(admin): confirmar que quem chama é admin (getCurrentUser) antes de executar.

// "Tentar novamente": cada operação repetível tem aqui a sua função,
// identificada pelo retryAction guardado no registo do erro.
const RETRY_HANDLERS: Record<string, (payload: unknown) => Promise<void>> = {
  "sync-catalogo": async () => void (await syncCatalog(updateTag)),
  "cliente-moloni": retryCustomerMoloni,
  "cliente-sap": retryCustomerSap,
  "cliente-moloni-dados": retryCustomerMoloniUpdate,
  "cliente-sap-dados": retryCustomerSapUpdate,
  "preco-sap": retryPrice,
  "material-sap": retryMaterial,
  "stock-sap": retryStockEntry,
};

export async function canRetry(action: string | null) {
  return !!action && action in RETRY_HANDLERS;
}

/** Botão «Sincronizar com o SAP»: o mesmo que o n8n faz de X em X minutos (src/lib/sync.ts). */
export async function syncCatalogNow() {
  try {
    await runFullSync(updateTag);
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
