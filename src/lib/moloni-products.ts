import "server-only";
import { db } from "@/lib/db";
import type { CatalogProduct } from "@/lib/catalog";
import { withLog } from "@/lib/integration/log";
import { moloniCall, moloniIds } from "@/lib/integration/moloni";

// Artigos e stock no Moloni. O stock de venda vive aqui: ao fechar uma fatura, o
// Moloni desconta-o sozinho. As entradas continuam a ser feitas no SAP (Manage Stock)
// e a sincronização passa para cá a diferença. Vender não mexe no stock do SAP,
// porque não há acesso a movimentos de mercadoria.

const CATEGORY_PERFUMES = 10661082;
const VAT = 0.23;
const GOODS = "M"; // categoria AT "mercadorias", obrigatória nos artigos com stock
const SYNC_RETRY = { action: "sync-catalogo", payload: {} };

type MoloniArticle = { product_id: number; reference: string; has_stock: number; price: number; stock: number };

/** O preço do SAP (PR00) inclui IVA; o do Moloni é sem IVA. */
const netPrice = (price: number | null) => Number(((price ?? 0) / (1 + VAT)).toFixed(4));

/** Stock de venda por código de material. */
export async function fetchMoloniStock() {
  const { company_id } = moloniIds();
  const articles = await withLog({ system: "Moloni", operation: "POST products/getAll", reference: "Stock", retry: SYNC_RETRY }, async () => {
    const list = await moloniCall<MoloniArticle[]>("products/getAll", { company_id, category_id: CATEGORY_PERFUMES });
    return list.map(({ reference, has_stock, stock }) => ({ reference, has_stock, stock }));
  });
  return new Map(articles.filter((a) => a.has_stock).map((a) => [a.reference, a.stock]));
}

function articleFields(product: CatalogProduct) {
  const { company_id, tax_id, unit_id } = moloniIds();
  return {
    company_id,
    category_id: CATEGORY_PERFUMES,
    type: 1, // produto
    name: product.name,
    reference: product.sapProduct,
    price: netPrice(product.price),
    unit_id,
    has_stock: 1,
    stock: product.stock,
    at_product_category: GOODS,
    taxes: [{ tax_id, value: VAT * 100, order: 1, cumulative: 0 }],
  };
}

/** Cria o artigo ou, se já existir, atualiza-o se o preço mudou ou se ainda não tinha stock. */
async function syncArticle(product: CatalogProduct, reference: string) {
  const { company_id } = moloniIds();
  const log = (operation: string) => ({ system: "Moloni" as const, operation, reference, retry: SYNC_RETRY });

  const [existing] = await withLog(log("POST products/getByReference"), () =>
    moloniCall<MoloniArticle[]>("products/getByReference", { company_id, reference: product.sapProduct }),
  );

  if (!existing) {
    const { product_id } = await withLog(log("POST products/insert"), () =>
      moloniCall<{ product_id: number }>("products/insert", articleFields(product)),
    );
    return product_id;
  }

  // Sem PR00 no SAP mantém o preço que o Moloni já tem, em vez de o pôr a zero
  const price = product.price != null ? netPrice(product.price) : existing.price;
  if (!existing.has_stock || existing.price !== price) {
    await withLog(log("POST products/update"), () =>
      moloniCall("products/update", { ...articleFields(product), price, product_id: existing.product_id }),
    );
  }
  return existing.product_id;
}

/** Passa para o Moloni os artigos, os preços e as entradas de stock feitas no SAP. */
export async function syncMoloniProducts(catalog: CatalogProduct[]) {
  const { company_id } = moloniIds();

  for (const product of catalog) {
    const { sapProduct } = product;
    const reference = `Produto ${sapProduct}`;
    const moloniProductId = await syncArticle(product, reference);
    const link = await db.moloniProduct.upsert({
      where: { sapProduct },
      update: { moloniProductId },
      create: { sapProduct, moloniProductId },
    });

    // Só a diferença: reenviar o stock do SAP apagaria as vendas já descontadas
    const entry = product.sapStock - link.sapStockSynced;
    if (entry === 0) continue;

    await withLog({ system: "Moloni", operation: "POST productStocks/insert", reference, retry: SYNC_RETRY }, async () => {
      await moloniCall("productStocks/insert", {
        company_id,
        product_id: moloniProductId,
        movement_date: new Date().toISOString().slice(0, 19).replace("T", " "),
        qty: entry,
        notes: "Entrada de stock vinda do SAP",
      });
      return { qty: entry };
    });
    await db.moloniProduct.update({ where: { sapProduct }, data: { sapStockSynced: product.sapStock } });
  }
}
