"use server";

import { redirect } from "next/navigation";
import { refresh, updateTag } from "next/cache";
import { db } from "@/lib/db";
import { findPhotoFor, savePhoto } from "@/lib/photos";
import { changeProductPrice } from "@/lib/prices";
import { createProductInSap } from "@/lib/products";
import { CONCENTRATIONS, GENDERS } from "@/lib/product-options";

// Ações da aba Produtos. A ficha da loja fica na BD local; o nome e o stock não se
// alteram aqui. O preço é gravado no SAP e copiado para o Moloni (changePrice).
// Um produto novo cria também o material no SAP (saveProduct, modo "novo").
// TODO(Auth0): confirmar que quem chama é admin (getCurrentUser) antes de executar.

export type ProductFormState = { ok: boolean; message: string; errors?: Record<string, string> } | null;

const text = (fd: FormData, name: string) => String(fd.get(name) ?? "").trim();

export async function saveProduct(_prev: ProductFormState, fd: FormData): Promise<ProductFormState> {
  const mode = text(fd, "mode"); // "novo" | "editar"
  const sapProduct = text(fd, "sapProduct").toUpperCase();
  const name = text(fd, "name"); // só no modo "novo": vai para a descrição do material no SAP
  const data = {
    family: text(fd, "family"),
    gender: text(fd, "gender"),
    concentration: text(fd, "concentration"),
    sizeMl: Number(text(fd, "sizeMl")),
    topNotes: text(fd, "topNotes"),
    heartNotes: text(fd, "heartNotes"),
    baseNotes: text(fd, "baseNotes"),
    description: text(fd, "description"),
    featured: fd.get("featured") === "on",
    visible: fd.get("visible") === "on",
  };

  // --- Validação ---
  const errors: Record<string, string> = {};
  const prefix = process.env.SAP_PRODUCT_PREFIX ?? "PERF";
  if (!/^[A-Z0-9-]{3,40}$/.test(sapProduct) || !sapProduct.startsWith(prefix)) {
    errors.sapProduct = `Código SAP inválido: tem de começar por ${prefix} (ex.: ${prefix}002-093).`;
  }
  if (mode === "novo" && (!name || name.length > 40)) errors.name = "Indique o nome do perfume (máx. 40 caracteres).";
  if (!data.family) errors.family = "Indique a família olfativa.";
  if (!GENDERS.some((g) => g.value === data.gender)) errors.gender = "Escolha o género.";
  if (!CONCENTRATIONS.includes(data.concentration)) errors.concentration = "Escolha a concentração.";
  if (!(Number.isInteger(data.sizeMl) && data.sizeMl > 0 && data.sizeMl <= 1000)) errors.sizeMl = "Tamanho em ml inválido.";
  for (const f of ["topNotes", "heartNotes", "baseNotes", "description"] as const) {
    if (!data[f]) errors[f] = "Campo obrigatório.";
  }
  if (Object.keys(errors).length > 0) return { ok: false, message: "Corrija os campos assinalados.", errors };

  if (mode === "novo" && (await db.productInfo.findUnique({ where: { sapProduct } }))) {
    return { ok: false, message: "Já existe uma ficha para este código.", errors: { sapProduct: "Código já usado." } };
  }

  // --- Foto (opcional) ---
  let imageUrl: string | undefined;
  const photo = fd.get("photo");
  if (photo instanceof File && photo.size > 0) {
    try {
      imageUrl = await savePhoto(photo, sapProduct);
    } catch (e) {
      return { ok: false, message: (e as Error).message, errors: { photo: (e as Error).message } };
    }
  }

  // Sem foto enviada e sem foto na ficha: usa a foto com o nome do código, se existir
  if (!imageUrl) {
    const current = await db.productInfo.findUnique({ where: { sapProduct }, select: { imageUrl: true } });
    if (!current?.imageUrl) imageUrl = (await findPhotoFor(sapProduct)) ?? undefined;
  }

  await db.productInfo.upsert({
    where: { sapProduct },
    update: { ...data, ...(imageUrl && { imageUrl }) },
    create: { sapProduct, ...data, imageUrl },
  });
  updateTag("catalogo"); // a loja passa a mostrar a ficha nova já no próximo pedido

  if (mode === "novo") {
    // A ficha fica guardada mesmo que o SAP falhe: o erro fica no monitor com "Tentar novamente"
    const sapOk = await createProductInSap(sapProduct, name).then(() => true, () => false);
    redirect(`/admin/produtos/${encodeURIComponent(sapProduct)}?criado=1&sap=${sapOk ? 1 : 0}`);
  }
  refresh();
  return { ok: true, message: "Ficha guardada." };
}

/** "Remover" da loja = esconder. O material continua no SAP. */
export async function setVisible(fd: FormData) {
  const sapProduct = text(fd, "sapProduct");
  const visible = fd.get("visible") === "1";
  await db.productInfo.update({ where: { sapProduct }, data: { visible } });
  updateTag("catalogo");
  refresh();
}

/** Liga/desliga o destaque na página inicial (botão ★ na lista de produtos). */
export async function setFeatured(fd: FormData) {
  const sapProduct = text(fd, "sapProduct");
  const featured = fd.get("featured") === "1";
  await db.productInfo.update({ where: { sapProduct }, data: { featured } });
  updateTag("catalogo");
  refresh();
}

export type PriceFormState = { ok: boolean; message: string } | null;

/** Altera o preço de venda, com IVA. */
export async function changePrice(_prev: PriceFormState, fd: FormData): Promise<PriceFormState> {
  const price = Number(text(fd, "price").replace(",", "."));
  if (!(price > 0 && price <= 9999.99)) return { ok: false, message: "Indique um preço entre 0,01 € e 9 999,99 €." };

  try {
    await changeProductPrice(text(fd, "sapProduct"), Number(price.toFixed(2)));
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Não foi possível alterar o preço." };
  }
  refresh();
  return { ok: true, message: "Preço alterado no SAP e no Moloni." };
}
