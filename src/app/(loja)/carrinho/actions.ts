"use server";

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { db } from "@/lib/db";
import { getStoreCatalog } from "@/lib/catalog";
import { CART_COOKIE, CART_COOKIE_OPTIONS, getCartId } from "@/lib/cart";

// Server Actions do carrinho: correm no servidor, chamadas pelos formulários.
// O stock usado aqui é o do catálogo (cache de ~1 min); o checkout volta a
// confirmar o stock diretamente no Moloni antes de faturar.

export type AddToCartState = { ok: boolean; message: string } | null;

const MAX_QTY = 99;

// Regista a última atividade do carrinho (usada no backoffice para
// distinguir carrinhos ativos de abandonados)
async function touchCart(cartId: string) {
  // updateMany não falha se o carrinho já não existir (cookie antigo)
  await db.cart.updateMany({ where: { id: cartId }, data: { updatedAt: new Date() } });
}

function readQuantity(formData: FormData) {
  const q = Number(formData.get("quantity"));
  return Number.isInteger(q) ? q : NaN;
}

export async function addToCart(_prev: AddToCartState, formData: FormData): Promise<AddToCartState> {
  const sapProduct = String(formData.get("sapProduct") ?? "");
  const quantity = readQuantity(formData);
  if (!(quantity >= 1 && quantity <= MAX_QTY)) return { ok: false, message: "Quantidade inválida." };

  let product;
  try {
    product = (await getStoreCatalog()).find((p) => p.sapProduct === sapProduct);
  } catch {
    return { ok: false, message: "Não foi possível confirmar o stock. Tente novamente dentro de momentos." };
  }
  if (!product) return { ok: false, message: "Este perfume não existe." };
  if (product.price === null) return { ok: false, message: "Este perfume ainda não tem preço." };
  if (product.stock <= 0) return { ok: false, message: "Este perfume está esgotado." };

  // Cria o carrinho na primeira vez e guarda o id no cookie
  let cartId = await getCartId();
  const cart = cartId ? await db.cart.findUnique({ where: { id: cartId } }) : null;
  if (!cart) {
    cartId = (await db.cart.create({ data: {} })).id;
    (await cookies()).set(CART_COOKIE, cartId, CART_COOKIE_OPTIONS);
  }

  const existing = await db.cartItem.findUnique({ where: { cartId_sapProduct: { cartId: cartId!, sapProduct } } });
  const newQty = (existing?.quantity ?? 0) + quantity;
  if (newQty > product.stock) {
    return {
      ok: false,
      message: `Só há ${product.stock} unidade(s) em stock${existing ? ` e já tem ${existing.quantity} no carrinho` : ""}.`,
    };
  }

  await db.cartItem.upsert({
    where: { cartId_sapProduct: { cartId: cartId!, sapProduct } },
    update: { quantity: newQty },
    create: { cartId: cartId!, sapProduct, quantity },
  });

  await touchCart(cartId!);
  refresh(); // atualiza o contador do cabeçalho
  return { ok: true, message: quantity === 1 ? "Adicionado ao carrinho." : `${quantity} unidades adicionadas ao carrinho.` };
}

/** Muda a quantidade de uma linha (0 remove). Limitada ao stock disponível. */
export async function updateQuantity(formData: FormData) {
  const cartId = await getCartId();
  const sapProduct = String(formData.get("sapProduct") ?? "");
  const quantity = readQuantity(formData);
  if (!cartId || Number.isNaN(quantity)) return;

  const where = { cartId_sapProduct: { cartId, sapProduct } };
  if (quantity <= 0) {
    await db.cartItem.deleteMany({ where: { cartId, sapProduct } });
  } else {
    const product = (await getStoreCatalog()).find((p) => p.sapProduct === sapProduct);
    const max = Math.min(product?.stock ?? 0, MAX_QTY);
    if (max <= 0) return;
    await db.cartItem.update({ where, data: { quantity: Math.min(quantity, max) } });
  }
  await touchCart(cartId);
  refresh();
}

export async function removeFromCart(formData: FormData) {
  const cartId = await getCartId();
  const sapProduct = String(formData.get("sapProduct") ?? "");
  if (!cartId) return;
  await db.cartItem.deleteMany({ where: { cartId, sapProduct } });
  await touchCart(cartId);
  refresh();
}
