import "server-only";
import { db } from "@/lib/db";
import type { AdminProduct } from "@/lib/catalog";
import { IntegrationError, withLog } from "@/lib/integration/log";
import { moloniCall, moloniIds } from "@/lib/integration/moloni";
import { updateSapPrice } from "@/lib/integration/sap-prices";

// Artigos no Moloni: é daqui que a loja lê o nome, o preço e o stock. Ao fechar uma
// fatura, o Moloni desconta o stock sozinho. Os produtos e as entradas de stock têm
// origem no SAP e a sincronização copia-os para cá. O preço pode mudar nos dois lados:
// a sincronização acerta-os (ver decidePrice). Vender não mexe no stock do SAP, porque
// não há acesso a movimentos de mercadoria.

const CATEGORY_PERFUMES = 10661082;
const VAT = 0.23;
const GOODS = "M"; // categoria AT "mercadorias", obrigatória nos artigos com stock
const SYNC_RETRY = { action: "sync-catalogo", payload: {} };

type MoloniArticle = { product_id: number; reference: string; name: string; has_stock: number; price: number; stock: number };

/** O preço do SAP (PR00) inclui IVA; o do Moloni é sem IVA. */
const netPrice = (price: number | null) => Number(((price ?? 0) / (1 + VAT)).toFixed(4));
const grossPrice = (price: number) => Number((price * (1 + VAT)).toFixed(2));

/** Artigos com gestão de stock, por código de material. O preço já vem com IVA. */
export async function fetchMoloniArticles() {
  const { company_id } = moloniIds();
  const articles = await withLog({ system: "Moloni", operation: "POST products/getAll", reference: "Artigos", retry: SYNC_RETRY }, async () => {
    const list = await moloniCall<MoloniArticle[]>("products/getAll", { company_id, category_id: CATEGORY_PERFUMES });
    return list.filter((a) => a.has_stock).map(({ reference, name, price, stock }) => ({ reference, name, price, stock }));
  });
  return new Map(articles.map((a) => [a.reference, { name: a.name, price: grossPrice(a.price), stock: a.stock }]));
}

function articleFields(product: AdminProduct) {
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

/**
 * Cria o artigo ou, se já existir, atualiza-o se ainda não tinha stock ou se o preço
 * tem de mudar. Com sapPrice = null, mantém o preço que o Moloni já tem.
 */
async function syncArticle(product: AdminProduct, sapPrice: number | null, reference: string) {
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

  const price = sapPrice != null ? netPrice(sapPrice) : existing.price;
  if (!existing.has_stock || existing.price !== price) {
    await withLog(log("POST products/update"), () =>
      moloniCall("products/update", { ...articleFields(product), price, product_id: existing.product_id }),
    );
  }
  return existing.product_id;
}

type PriceSource = "sap" | "moloni" | "nenhum" | "conflito";

/**
 * Decide qual o preço certo. Dois números diferentes não dizem qual mudou, por isso
 * comparamos com o último preço sincronizado: o lado que ainda o tem não mudou.
 */
function decidePrice(product: AdminProduct, priceSynced: number | null): PriceSource {
  const { price: sap, moloniPrice } = product;
  const moloni = moloniPrice && moloniPrice > 0 ? moloniPrice : null;

  if (sap == null) return "nenhum"; // sem PR00 (ou em edição): mantém o que o Moloni tem
  if (moloni == null || moloni === sap || priceSynced == null) return "sap";
  if (sap === priceSynced) return "moloni";
  if (moloni === priceSynced) return "sap";
  return "conflito";
}

/** Fica no monitor até alguém escolher o preço na ficha do produto. */
async function reportConflict(product: AdminProduct, reference: string) {
  await withLog({ system: "Moloni", operation: "Conflito de preço", reference }, async () => {
    throw new IntegrationError(
      "Moloni",
      `O preço mudou nos dois sistemas (SAP ${product.price} €, Moloni ${product.moloniPrice} €). Escolha o preço certo na ficha do produto.`,
    );
  }).catch(() => {});
}

/**
 * Passa para o Moloni os artigos e as entradas de stock do SAP, e acerta os preços.
 * Com forceSapPrice, o preço do SAP ganha sempre: é o que acontece ao gravar na ficha.
 */
export async function syncMoloniProducts(catalog: AdminProduct[], { forceSapPrice = false } = {}) {
  const { company_id } = moloniIds();

  for (const product of catalog) {
    const { sapProduct } = product;
    const reference = `Produto ${sapProduct}`;

    const previous = await db.moloniProduct.findUnique({ where: { sapProduct } });
    const source = forceSapPrice ? "sap" : decidePrice(product, previous?.priceSynced ?? null);
    if (source === "conflito") await reportConflict(product, reference);

    const moloniProductId = await syncArticle(product, source === "sap" ? product.price : null, reference);
    await db.moloniProduct.upsert({
      where: { sapProduct },
      update: { moloniProductId },
      create: { sapProduct, moloniProductId },
    });

    if (source === "sap") {
      await db.moloniProduct.update({ where: { sapProduct }, data: { priceSynced: product.price } });
    } else if (source === "moloni") {
      const price = product.moloniPrice!;
      // Se falhar (ex.: rascunho aberto no SAP), fica no monitor e os outros produtos continuam
      const saved = await updateSapPrice(sapProduct, price, reference, { action: "preco-sap", payload: { sapProduct, price } })
        .then(() => true, () => false);
      if (saved) await db.moloniProduct.update({ where: { sapProduct }, data: { priceSynced: price } });
    }

    // Só a diferença: reenviar o stock do SAP apagaria as vendas já descontadas.
    // O que já passou conta-se no Moloni, que é partilhado por todos os PCs.
    const entry = product.sapStock - (await sapStockInMoloni(moloniProductId, reference));
    if (entry === 0) continue;

    await withLog({ system: "Moloni", operation: "POST productStocks/insert", reference, retry: SYNC_RETRY }, async () => {
      await moloniCall("productStocks/insert", {
        company_id,
        product_id: moloniProductId,
        movement_date: new Date().toISOString().slice(0, 19).replace("T", " "),
        qty: entry,
        notes: SAP_ENTRY_NOTE,
      });
      return { qty: entry };
    });
  }
}

const SAP_ENTRY_NOTE = "Entrada de stock vinda do SAP";
const PAGE = 50;

/**
 * Stock do SAP que já passou para o Moloni: soma dos movimentos de entrada que a
 * sincronização criou (marcados com SAP_ENTRY_NOTE). Antes guardava-se este total na
 * BD local, mas cada PC tem a sua BD e o Moloni é um só: num PC novo o total era 0 e
 * o stock do SAP entrava outra vez em duplicado.
 */
async function sapStockInMoloni(productId: number, reference: string) {
  const { company_id } = moloniIds();
  return withLog({ system: "Moloni", operation: "POST productStocks/getAll", reference, retry: SYNC_RETRY }, async () => {
    let total = 0;
    for (let offset = 0; ; offset += PAGE) {
      const page = await moloniCall<{ qty: number; notes: string }[]>("productStocks/getAll", {
        company_id, product_id: productId, qty: PAGE, offset,
      });
      total += page.filter((m) => m.notes === SAP_ENTRY_NOTE).reduce((sum, m) => sum + Number(m.qty), 0);
      if (page.length < PAGE) return total;
    }
  });
}
