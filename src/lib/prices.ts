import "server-only";
import { updateTag } from "next/cache";
import { getCatalog } from "@/lib/catalog";
import { updateSapPrice } from "@/lib/integration/sap-prices";
import { syncMoloniProducts } from "@/lib/moloni-products";

// Alterar um preço: o SAP é a origem, por isso grava lá primeiro e só depois
// copia para o Moloni, que é de onde a loja lê.

type PriceChange = { sapProduct: string; price: number };

export async function changeProductPrice(sapProduct: string, price: number) {
  const product = (await getCatalog()).find((p) => p.sapProduct === sapProduct);
  if (!product) throw new Error("Este material não existe no SAP.");

  await updateSapPrice(sapProduct, price, `Preço ${sapProduct}`, { action: "preco-sap", payload: { sapProduct, price } });

  // Usa o valor acabado de gravar: não depende de uma nova leitura ao SAP.
  // Se o Moloni falhar aqui, o erro fica no monitor e sincronizar copia o preço do SAP.
  updateTag("catalogo");
  await syncMoloniProducts([{ ...product, price }], { forceSapPrice: true });
  updateTag("catalogo");
}

// "Tentar novamente" no monitor de integração
export async function retryPrice(payload: unknown) {
  const { sapProduct, price } = payload as PriceChange;
  await changeProductPrice(sapProduct, price);
}
