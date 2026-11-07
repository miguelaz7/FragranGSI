import "server-only";
import { updateTag } from "next/cache";
import { getCatalog } from "@/lib/catalog";
import { createSapMaterial, sapMaterialExists } from "@/lib/integration/sap-products";
import { syncMoloniProducts } from "@/lib/moloni-products";

// Novo produto: cria o material no SAP e o artigo no Moloni. O stock e o primeiro
// preço (PR00) continuam a ser criados nas apps do SAP.

type NewMaterial = { sapProduct: string; name: string };

export async function createProductInSap(sapProduct: string, name: string) {
  const reference = `Produto ${sapProduct}`;
  const retry = { action: "material-sap", payload: { sapProduct, name } satisfies NewMaterial };

  // Pode já existir: foi criado à mão, ou esta é uma nova tentativa
  if (!(await sapMaterialExists(sapProduct, reference))) {
    await createSapMaterial(sapProduct, name, reference, retry);
  }

  updateTag("catalogo");
  const product = (await getCatalog()).find((p) => p.sapProduct === sapProduct);
  // O material já está criado: se o Moloni falhar, o erro fica no monitor e sincronizar resolve
  if (product) await syncMoloniProducts([product]).catch(() => {});
  updateTag("catalogo");
}

// "Tentar novamente" no monitor de integração
export async function retryMaterial(payload: unknown) {
  const { sapProduct, name } = payload as NewMaterial;
  await createProductInSap(sapProduct, name);
}
