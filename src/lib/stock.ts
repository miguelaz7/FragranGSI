import "server-only";
import { updateTag } from "next/cache";
import { getCatalog } from "@/lib/catalog";
import { getSapStock, postSapStockEntry } from "@/lib/integration/sap-stock";
import { syncMoloniProducts } from "@/lib/moloni-products";

// Entrada de stock a partir do backoffice: o SAP é a origem das entradas, por isso
// lança lá primeiro e depois passa a diferença para o Moloni, de onde a loja vende.

type StockEntry = { sapProduct: string; quantity: number; expected: number };

export async function addStockEntry(sapProduct: string, quantity: number) {
  const reference = `Stock ${sapProduct}`;
  const before = await getSapStock(sapProduct, reference);
  // "expected" deixa o "Tentar novamente" saber se o lançamento já tinha entrado
  const retry = { action: "stock-sap", payload: { sapProduct, quantity, expected: before + quantity } satisfies StockEntry };
  await postSapStockEntry(sapProduct, quantity, reference, retry);
  await copyStockToMoloni(sapProduct, before + quantity);
}

/**
 * Stock inicial de um perfume novo: só lança se o SAP ainda não tiver stock, para
 * que repetir a criação do produto não duplique a entrada.
 */
export async function addInitialStock(sapProduct: string, quantity: number) {
  const reference = `Stock ${sapProduct}`;
  if ((await getSapStock(sapProduct, reference)) > 0) return;
  await postSapStockEntry(sapProduct, quantity, reference, {
    action: "stock-sap",
    payload: { sapProduct, quantity, expected: quantity } satisfies StockEntry,
  });
}

/** Passa para o Moloni a nova entrada (a sincronização envia só a diferença). */
async function copyStockToMoloni(sapProduct: string, sapStock: number) {
  updateTag("catalogo");
  const product = (await getCatalog()).find((p) => p.sapProduct === sapProduct);
  // A entrada já está no SAP: se o Moloni falhar, o erro fica no monitor e sincronizar resolve
  if (product) await syncMoloniProducts([{ ...product, sapStock }]).catch(() => {});
  updateTag("catalogo");
}

// "Tentar novamente" no monitor de integração. Um lançamento que deu timeout pode ter
// entrado na mesma: se o SAP já tiver o stock esperado, não volta a lançar.
export async function retryStockEntry(payload: unknown) {
  const { sapProduct, quantity, expected } = payload as StockEntry;
  const reference = `Stock ${sapProduct}`;
  const current = await getSapStock(sapProduct, reference);
  if (current < expected) {
    await postSapStockEntry(sapProduct, quantity, reference, { action: "stock-sap", payload });
  }
  await copyStockToMoloni(sapProduct, Math.max(current, expected));
}
