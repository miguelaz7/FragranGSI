import "server-only";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { getStoreCatalog, type CatalogProduct } from "@/lib/catalog";

// Carrinho de visitante: o browser guarda só o id do carrinho num cookie
// httpOnly; os artigos ficam na BD local. Assim dá para comprar sem conta
// até ao checkout, onde é pedido o início de sessão.

export const CART_COOKIE = "carrinho";
export const CART_COOKIE_OPTIONS = {
  httpOnly: true, // o JavaScript do browser não lhe consegue aceder
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 30, // 30 dias
};

export async function getCartId() {
  return (await cookies()).get(CART_COOKIE)?.value ?? null;
}

/** Nº total de artigos, para o ícone do cabeçalho (só BD, sem SAP). */
export async function getCartCount() {
  const id = await getCartId();
  if (!id) return 0;
  const sum = await db.cartItem.aggregate({ where: { cartId: id }, _sum: { quantity: true } });
  return sum._sum.quantity ?? 0;
}

export type CartLine = {
  sapProduct: string;
  quantity: number;
  product: CatalogProduct | null; // null se o perfume deixou de existir no SAP
  subtotal: number;
  problem: string | null; // motivo que impede finalizar a compra
};

/** Artigos do carrinho juntos com o catálogo (preço do SAP e stock do Moloni). */
export async function getCartView() {
  const id = await getCartId();
  const items = id ? await db.cartItem.findMany({ where: { cartId: id }, orderBy: { id: "asc" } }) : [];
  if (items.length === 0) return { lines: [] as CartLine[], total: 0, canCheckout: false };

  const catalog = await getStoreCatalog();
  const lines: CartLine[] = items.map((item) => {
    const product = catalog.find((p) => p.sapProduct === item.sapProduct) ?? null;
    let problem: string | null = null;
    if (!product) problem = "Este perfume já não está disponível.";
    else if (product.price === null) problem = "Preço indisponível de momento.";
    else if (product.stock <= 0) problem = "Esgotado.";
    else if (item.quantity > product.stock) problem = `Só há ${product.stock} unidade(s) em stock.`;
    return {
      sapProduct: item.sapProduct,
      quantity: item.quantity,
      product,
      subtotal: (product?.price ?? 0) * item.quantity,
      problem,
    };
  });

  const total = lines.filter((l) => !l.problem).reduce((sum, l) => sum + l.subtotal, 0);
  return { lines, total, canCheckout: lines.every((l) => !l.problem) };
}
