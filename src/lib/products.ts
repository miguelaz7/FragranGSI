import "server-only";
import { updateTag } from "next/cache";
import { getCatalog } from "@/lib/catalog";
import { updateSapPrice } from "@/lib/integration/sap-prices";
import { createSapMaterial, sapMaterialExists } from "@/lib/integration/sap-products";
import { syncMoloniProducts } from "@/lib/moloni-products";
import { addInitialStock } from "@/lib/stock";

// Novo produto: cria no SAP o material, o primeiro preço (PR00) e a entrada de stock
// inicial, e depois o artigo no Moloni com esse preço e stock.

type NewMaterial = { sapProduct: string; name: string; price?: number | null; stock?: number };

export async function createProductInSap(sapProduct: string, name: string, price?: number | null, stock = 0) {
  const reference = `Produto ${sapProduct}`;
  const retry = { action: "material-sap", payload: { sapProduct, name, price, stock } satisfies NewMaterial };

  // Pode já existir: foi criado à mão, ou esta é uma nova tentativa
  if (!(await sapMaterialExists(sapProduct, reference))) {
    await createSapMaterial(sapProduct, name, reference, retry);
  }

  // O material já existe: se o preço ou o stock falharem, o erro fica no monitor com
  // "Tentar novamente" e a ficha do produto continua a permitir fazê-los à mão
  if (price) {
    await updateSapPrice(sapProduct, price, `Preço ${sapProduct}`, { action: "preco-sap", payload: { sapProduct, price } }).catch(() => {});
  }
  if (stock > 0) await addInitialStock(sapProduct, stock).catch(() => {});

  updateTag("catalogo");
  const product = (await getCatalog()).find((p) => p.sapProduct === sapProduct);
  // Se o Moloni falhar, o erro fica no monitor e sincronizar resolve
  if (product) await syncMoloniProducts([product]).catch(() => {});
  updateTag("catalogo");
}

// "Tentar novamente" no monitor de integração
export async function retryMaterial(payload: unknown) {
  const { sapProduct, name, price, stock } = payload as NewMaterial;
  await createProductInSap(sapProduct, name, price, stock);
}
