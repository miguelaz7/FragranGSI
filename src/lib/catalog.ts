import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/lib/db";
import { parseODataDate, sapConfig, sapGet } from "@/lib/integration/sap";
import { withLog } from "@/lib/integration/log";
import { fetchMoloniArticles } from "@/lib/moloni-products";
import type { ProductInfo } from "@/generated/prisma/client";

// Dois catálogos:
// - Loja (getStoreCatalog): lê só o Moloni e a ficha local; não depende do SAP.
// - Backoffice (getCatalog): junta SAP e Moloni, para sincronizar e comparar.
// O SAP é a origem dos produtos, dos preços e das entradas de stock. O Moloni guarda
// uma cópia, e o stock vendável vive lá porque as vendas não conseguem descontar no SAP.

export type StockStatus = "ok" | "low" | "out";

export type CatalogProduct = {
  sapProduct: string;
  name: string;
  price: number | null; // com IVA; null se não houver preço válido
  currency: string;
  stock: number; // stock vendável (Moloni); desce com as faturas
  stockStatus: StockStatus;
  visible: boolean; // false = escondido da loja pelo backoffice
  info: Omit<ProductInfo, "sapProduct"> | null;
};

/** No backoffice também se vê o stock de utilização livre no SAP (só sobe com entradas). */
export type AdminProduct = CatalogProduct & {
  sapStock: number;
  moloniPrice: number | null; // com IVA; "price" é o PR00 do SAP
};

const LOW_STOCK = 5; // a partir daqui mostra "Últimas unidades"

// --- Formato das respostas do SAP (só os campos que usamos) ---
type SapProduct = { Product: string; ProductDescription: string; Plant: string };
type SapStock = { Material: string; InventoryStockType: string; MatlWrhsStkQtyInMatlBaseUnit: string };
type SapPrice = {
  Material: string;
  ConditionRateValue: string;
  ConditionRateValueUnit: string;
  ConditionValidityStartDate: string; // "/Date(1775779200000)/"
  ConditionValidityEndDate: string;
  IsActiveEntity: boolean;
};

const UNRESTRICTED_STOCK = "01"; // tipo de stock "utilização livre"

const stockStatus = (qty: number): StockStatus => (qty <= 0 ? "out" : qty <= LOW_STOCK ? "low" : "ok");

// Se uma leitura falhar, o backoffice pode repetir a sincronização do catálogo
// ("Tentar novamente" no monitor de integração)
const SYNC_RETRY = { action: "sync-catalogo", payload: {} };

async function fetchSapProducts() {
  const { prefix, plant } = sapConfig();
  return withLog({ system: "SAP", operation: "GET UI_PRODUCTLIST/ProductList", reference: "Catálogo", retry: SYNC_RETRY }, () =>
    sapGet<{ results: SapProduct[] }>("UI_PRODUCTLIST", "ProductList", {
      $filter: `Plant eq '${plant}' and startswith(Product,'${prefix}')`,
      $top: "500",
    }),
  );
}

async function fetchSapStock() {
  const { prefix, plant } = sapConfig();
  return withLog({ system: "SAP", operation: "GET C_STOCKQUANTITYVALUEBYTYPE", reference: "Stock", retry: SYNC_RETRY }, () =>
    sapGet<{ results: SapStock[] }>("C_STOCKQUANTITYVALUEBYTYPE_CDS", "C_STOCKQUANTITYVALUEBYTYPE", {
      // O serviço de stock exige sempre o filtro Plant
      $filter: `Plant eq '${plant}' and startswith(Material,'${prefix}')`,
      $top: "1000",
    }),
  );
}

async function fetchSapPrices() {
  const { prefix, salesOrg, channel } = sapConfig();
  return withLog({ system: "SAP", operation: "GET C_SlsPricingConditionRecordTP (PR00)", reference: "Preços", retry: SYNC_RETRY }, () =>
    sapGet<{ results: SapPrice[] }>("SD_PRICING_CONDITIONRECORD_SRV", "C_SlsPricingConditionRecordTP", {
      // Filtrar pela chave da tabela 304 é rápido (~1,5 s). NÃO filtrar por
      // IsActiveEntity: torna o pedido muito lento (>2 min). Os rascunhos
      // são ignorados mais abaixo, no código.
      $filter:
        `ConditionTable eq '304' and ConditionType eq 'PR00' and SalesOrganization eq '${salesOrg}'` +
        ` and DistributionChannel eq '${channel}' and startswith(Material,'${prefix}')`,
      $top: "1000",
    }),
  );
}

/**
 * Lê o catálogo do backoffice. Guardado em cache durante cerca de 1 minuto
 * ("minutes"), para não repetir os pedidos em cada visita; o stock tem de voltar
 * a ser validado no Moloni no checkout. A tag "catalogo" permite ao backoffice
 * forçar uma nova leitura ("Sincronizar agora").
 */
export async function getCatalog(): Promise<AdminProduct[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("catalogo");

  // Os pedidos são independentes: correm em paralelo
  const [products, stock, prices, articles, infos] = await Promise.all([
    fetchSapProducts(),
    fetchSapStock(),
    fetchSapPrices(),
    fetchMoloniArticles(),
    db.productInfo.findMany(),
  ]);

  // Stock livre por material (pode haver várias linhas: uma por depósito)
  const stockBy = new Map<string, number>();
  for (const s of stock.results) {
    if (s.InventoryStockType !== UNRESTRICTED_STOCK) continue;
    stockBy.set(s.Material, (stockBy.get(s.Material) ?? 0) + Number(s.MatlWrhsStkQtyInMatlBaseUnit));
  }

  // Preço ativo e válido hoje, por material
  const now = new Date();
  const priceBy = new Map<string, { value: number; currency: string }>();
  for (const p of prices.results) {
    if (!p.IsActiveEntity) continue;
    if (parseODataDate(p.ConditionValidityStartDate) > now || parseODataDate(p.ConditionValidityEndDate) < now) continue;
    priceBy.set(p.Material, { value: Number(p.ConditionRateValue), currency: p.ConditionRateValueUnit });
  }

  const infoBy = new Map(infos.map(({ sapProduct, ...info }) => [sapProduct, info]));

  return products.results
    .map((p) => {
      // Um material ainda sem artigo no Moloni não se pode vender: conta como esgotado
      const qty = articles.get(p.Product)?.stock ?? 0;
      const price = priceBy.get(p.Product);
      return {
        sapProduct: p.Product,
        name: p.ProductDescription || p.Product,
        price: price?.value ?? null,
        currency: price?.currency ?? "EUR",
        stock: qty,
        sapStock: stockBy.get(p.Product) ?? 0,
        moloniPrice: articles.get(p.Product)?.price ?? null,
        stockStatus: stockStatus(qty),
        visible: infoBy.get(p.Product)?.visible ?? true,
        info: infoBy.get(p.Product) ?? null,
      } satisfies AdminProduct;
    })
    .sort((a, b) => a.name.localeCompare(b.name, "pt"));
}

/**
 * Catálogo que o cliente vê: lê só o Moloni e a ficha local, por isso a loja continua
 * a funcionar se o SAP falhar. Mostra os perfumes visíveis, com ficha e com preço;
 * os esgotados continuam, porque já estão configurados.
 */
export async function getStoreCatalog(): Promise<CatalogProduct[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("catalogo");

  const [articles, infos] = await Promise.all([fetchMoloniArticles(), db.productInfo.findMany()]);

  return infos
    .flatMap(({ sapProduct, ...info }) => {
      const article = articles.get(sapProduct);
      if (!article || !info.visible || article.price <= 0) return [];
      return [{
        sapProduct,
        name: article.name,
        price: article.price,
        currency: "EUR",
        stock: article.stock,
        stockStatus: stockStatus(article.stock),
        visible: true,
        info,
      } satisfies CatalogProduct];
    })
    .sort((a, b) => a.name.localeCompare(b.name, "pt"));
}

/** A ficha da loja tem todos os campos preenchidos? */
export function isInfoComplete(info: CatalogProduct["info"]) {
  return !!info && [info.family, info.gender, info.concentration, info.topNotes, info.heartNotes, info.baseNotes, info.description]
    .every((v) => v.trim() !== "") && info.sizeMl > 0;
}

export const stockLabel: Record<StockStatus, string> = {
  ok: "Em stock",
  low: "Últimas unidades",
  out: "Esgotado",
};
