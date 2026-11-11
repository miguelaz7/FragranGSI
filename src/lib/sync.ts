import "server-only";
import { db } from "@/lib/db";
import { getCatalog } from "@/lib/catalog";
import { syncSapDrafts } from "@/lib/customers";
import { syncMoloniProducts } from "@/lib/moloni-products";

// Sincronização SAP ↔ Moloni. A mesma lógica serve o botão «Sincronizar com o SAP»
// e a sincronização automática (n8n → POST /api/sync).

/**
 * Invalida a cache do catálogo. Numa Server Action é updateTag; numa API Route,
 * onde o updateTag não existe, é revalidateTag(tag, { expire: 0 }).
 */
type Invalidate = (tag: string) => void;

/** Lê de novo o SAP e passa para o Moloni os artigos, os preços e as entradas de stock. */
export async function syncCatalog(invalidate: Invalidate) {
  invalidate("catalogo"); // a cache do catálogo deixa de valer
  const catalog = await getCatalog(); // e é lida já de novo
  await syncMoloniProducts(catalog);
  invalidate("catalogo"); // o stock e os preços do Moloni podem ter mudado
  return catalog.length;
}

export type SyncResult = { produtos: number; rascunhosClientes: number; erros: number; duracaoMs: number };

// Uma sincronização de cada vez: o n8n e o botão a correr juntos podiam ler o mesmo
// stock e enviar a mesma entrada duas vezes. Fica no globalThis para valer também
// entre a API Route e as Server Actions, que o Next carrega em módulos separados.
const lock = globalThis as unknown as { syncRunning?: Promise<SyncResult> };

export function syncInProgress() {
  return !!lock.syncRunning;
}

/** Sincronização completa: catálogo (artigos, preços, stock) e clientes em rascunho no SAP. */
export function runFullSync(invalidate: Invalidate): Promise<SyncResult> {
  lock.syncRunning ??= (async () => {
    const start = new Date();
    try {
      const rascunhosClientes = await db.user.count({ where: { sapDraftUuid: { not: null }, sapBusinessPartner: null } });
      await syncSapDrafts().catch(() => {}); // os erros ficam no monitor; o catálogo continua
      const produtos = await syncCatalog(invalidate);
      // Cada chamada ao SAP e ao Moloni já ficou no IntegrationLog: conta as que falharam
      const erros = await db.integrationLog.count({ where: { createdAt: { gte: start }, status: "Erro" } });
      return { produtos, rascunhosClientes, erros, duracaoMs: Date.now() - start.getTime() };
    } finally {
      lock.syncRunning = undefined;
    }
  })();
  return lock.syncRunning;
}
