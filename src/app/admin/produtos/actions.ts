"use server";

import { redirect } from "next/navigation";
import { refresh, updateTag } from "next/cache";
import { db } from "@/lib/db";
import { savePhoto } from "@/lib/photos";
import { CONCENTRATIONS, GENDERS } from "@/lib/product-options";

// Ações da aba Produtos. Só escrevem na BD local (ficha da loja): o nome,
// o preço e o stock são do SAP e não se alteram aqui.
// TODO(Auth0): confirmar que quem chama é admin (getCurrentUser) antes de executar.

export type ProductFormState = { ok: boolean; message: string; errors?: Record<string, string> } | null;

const text = (fd: FormData, name: string) => String(fd.get(name) ?? "").trim();

export async function saveProduct(_prev: ProductFormState, fd: FormData): Promise<ProductFormState> {
  const mode = text(fd, "mode"); // "novo" | "editar"
  const sapProduct = text(fd, "sapProduct").toUpperCase();
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

  await db.productInfo.upsert({
    where: { sapProduct },
    update: { ...data, ...(imageUrl && { imageUrl }) },
    create: { sapProduct, ...data, imageUrl },
  });
  updateTag("catalogo"); // a loja passa a mostrar a ficha nova já no próximo pedido

  if (mode === "novo") redirect(`/admin/produtos/${encodeURIComponent(sapProduct)}?criado=1`);
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
