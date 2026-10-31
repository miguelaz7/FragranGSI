import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/lib/db";
import { sapGet } from "@/lib/integration/sap";
import { withLog } from "@/lib/integration/log";
import type { ProductInfo } from "@/generated/prisma/client";

// Catálogo da loja = produtos do SAP (nome, preço, stock) + enriquecimento local
// (família, notas olfativas, foto). O SAP é o System of Record: um perfume só
// aparece na loja se existir no SAP; os dados locais são opcionais.

export type StockStatus = "ok" | "low" | "out";

export type CatalogProduct = {
  sapProduct: string;
  name: string; // descrição do material no SAP
  price: number | null; // PR00; null se não houver preço válido
  currency: string;
  stock: number; // stock de utilização livre no centro
  stockStatus: StockStatus;
  info: Omit<ProductInfo, "sapProduct"> | null;
};

const LOW_STOCK = 5; // a partir daqui mostra "Últimas unidades"

// Estrutura organizacional (ver .env): só lemos os materiais do grupo
function sapConfig() {
  const { SAP_PRODUCT_PREFIX, SAP_PLANT, SAP_SALES_ORG, SAP_DISTRIBUTION_CHANNEL } = process.env;
  return {
    prefix: SAP_PRODUCT_PREFIX ?? "PERF",
    plant: SAP_PLANT ?? "HD00",
    salesOrg: SAP_SALES_ORG ?? "DS00",
    channel: SAP_DISTRIBUTION_CHANNEL ?? "WH",
  };
}

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

/** Converte as datas OData v2 ("/Date(1775779200000)/") em Date. */
function parseODataDate(value: string) {
  return new Date(Number(value.match(/\d+/)?.[0] ?? 0));
}

async function fetchSapProducts() {
  const { prefix, plant } = sapConfig();
  return withLog({ system: "SAP", operation: "GET UI_PRODUCTLIST/ProductList", reference: "Catálogo" }, () =>
    sapGet<{ results: SapProduct[] }>("UI_PRODUCTLIST", "ProductList", {
      $filter: `Plant eq '${plant}' and startswith(Product,'${prefix}')`,
      $top: "500",
    }),
  );
}

async function fetchSapStock() {
  const { prefix, plant } = sapConfig();
  return withLog({ system: "SAP", operation: "GET C_STOCKQUANTITYVALUEBYTYPE", reference: "Stock" }, () =>
    sapGet<{ results: SapStock[] }>("C_STOCKQUANTITYVALUEBYTYPE_CDS", "C_STOCKQUANTITYVALUEBYTYPE", {
      // O serviço de stock exige sempre o filtro Plant
      $filter: `Plant eq '${plant}' and startswith(Material,'${prefix}')`,
      $top: "1000",
    }),
  );
}

async function fetchSapPrices() {
  const { prefix, salesOrg, channel } = sapConfig();
  return withLog({ system: "SAP", operation: "GET C_SlsPricingConditionRecordTP (PR00)", reference: "Preços" }, () =>
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
 * Lê o catálogo completo. Guardado em cache durante cerca de 1 minuto
 * ("minutes"), para não fazer 3 pedidos ao SAP em cada visita; o stock volta
 * a ser validado no SAP no checkout. A tag "catalogo" permite ao backoffice
 * forçar uma nova leitura ("Sincronizar agora").
 */
export async function getCatalog(): Promise<CatalogProduct[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("catalogo");

  // Os três pedidos são independentes: correm em paralelo
  const [products, stock, prices, infos] = await Promise.all([
    fetchSapProducts(),
    fetchSapStock(),
    fetchSapPrices(),
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
      const qty = stockBy.get(p.Product) ?? 0;
      const price = priceBy.get(p.Product);
      return {
        sapProduct: p.Product,
        name: p.ProductDescription || p.Product,
        price: price?.value ?? null,
        currency: price?.currency ?? "EUR",
        stock: qty,
        stockStatus: qty <= 0 ? "out" : qty <= LOW_STOCK ? "low" : "ok",
        info: infoBy.get(p.Product) ?? null,
      } satisfies CatalogProduct;
    })
    .sort((a, b) => a.name.localeCompare(b.name, "pt"));
}

export const stockLabel: Record<StockStatus, string> = {
  ok: "Em stock",
  low: "Últimas unidades",
  out: "Esgotado",
};
