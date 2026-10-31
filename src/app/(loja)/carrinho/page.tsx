import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getCartView } from "@/lib/cart";
import { stockLabel } from "@/lib/catalog";
import { formatEur } from "@/lib/format";
import { ProductImage } from "@/components/loja/ProductImage";
import { CatalogError } from "@/components/loja/CatalogError";
import { removeFromCart, updateQuantity } from "./actions";

export const metadata: Metadata = { title: "Carrinho" };

export default function CarrinhoPage() {
  return (
    <div className="flex flex-col gap-8 py-10">
      <h1 className="font-serif text-5xl">O seu carrinho</h1>
      <Suspense fallback={<p className="text-loja-muted">A carregar carrinho…</p>}>
        <Cart />
      </Suspense>
    </div>
  );
}

const qtyButton = "flex size-10 items-center justify-center text-lg hover:text-ouro disabled:opacity-40";

async function Cart() {
  let cart;
  try {
    cart = await getCartView();
  } catch {
    return <CatalogError />;
  }

  if (cart.lines.length === 0) {
    return (
      <div className="flex flex-col items-start gap-5">
        <p className="text-loja-muted">O carrinho está vazio.</p>
        <Link href="/catalogo" className="text-ouro hover:underline">Ver perfumes →</Link>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-start gap-10">
      <section aria-label="Artigos" className="flex flex-[999_1_520px] flex-col">
        {cart.lines.map((line) => {
          const p = line.product;
          const max = p ? Math.min(p.stock, 99) : 0;
          return (
            <div key={line.sapProduct} className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-loja-line py-6 first:border-t">
              <div className="w-20 shrink-0">
                <ProductImage src={p?.info?.imageUrl} />
              </div>
              <div className="flex min-w-[180px] flex-1 flex-col gap-1">
                {p ? (
                  <Link href={`/produto/${encodeURIComponent(line.sapProduct)}`} className="font-serif text-xl hover:text-ouro">{p.name}</Link>
                ) : (
                  <span className="font-serif text-xl">{line.sapProduct}</span>
                )}
                {p?.info && <span className="text-sm text-loja-muted">{p.info.concentration} · {p.info.sizeMl} ml</span>}
                {line.problem ? (
                  <span className="text-sm text-[#F2B8B5]">{line.problem}</span>
                ) : (
                  p && <span className="text-xs text-stock-ok">● {stockLabel[p.stockStatus]}</span>
                )}
              </div>

              {/* Cada botão é um pequeno formulário que chama a Server Action com a nova quantidade */}
              <div className="flex items-center border border-[#4A443B]">
                <form action={updateQuantity}>
                  <input type="hidden" name="sapProduct" value={line.sapProduct} />
                  <input type="hidden" name="quantity" value={line.quantity - 1} />
                  <button type="submit" aria-label="Diminuir quantidade" className={qtyButton}>−</button>
                </form>
                <span className="w-8 text-center">{line.quantity}</span>
                <form action={updateQuantity}>
                  <input type="hidden" name="sapProduct" value={line.sapProduct} />
                  <input type="hidden" name="quantity" value={line.quantity + 1} />
                  <button type="submit" aria-label="Aumentar quantidade" disabled={line.quantity >= max} className={qtyButton}>+</button>
                </form>
              </div>

              <span className="w-24 text-right font-semibold">{p?.price != null ? formatEur(line.subtotal) : "—"}</span>

              <form action={removeFromCart}>
                <input type="hidden" name="sapProduct" value={line.sapProduct} />
                <button type="submit" aria-label={`Remover ${p?.name ?? line.sapProduct}`} className="flex size-10 items-center justify-center text-loja-muted hover:text-ouro">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </form>
            </div>
          );
        })}
        <Link href="/catalogo" className="mt-6 text-sm text-ouro hover:underline">← Continuar a comprar</Link>
      </section>

      <aside aria-label="Resumo" className="flex flex-[1_1_300px] flex-col gap-4 border border-loja-line bg-loja-surface p-7">
        <h2 className="font-serif text-2xl">Resumo</h2>
        <div className="flex justify-between text-sm">
          <span className="text-loja-muted">Subtotal</span>
          <span>{formatEur(cart.total)}</span>
        </div>
        <div className="flex justify-between border-t border-loja-line pt-4 text-lg font-semibold">
          <span>Total</span>
          <span>{formatEur(cart.total)}</span>
        </div>
        <span className="text-xs leading-relaxed text-loja-muted">IVA incluído. A fatura é emitida automaticamente após a confirmação.</span>
        {cart.canCheckout ? (
          <Link href="/checkout" className="flex h-13 items-center justify-center bg-ouro font-semibold text-loja-bg hover:bg-ouro/90">
            Finalizar compra
          </Link>
        ) : (
          <>
            <span className="flex h-13 items-center justify-center bg-ouro font-semibold text-loja-bg opacity-50" aria-disabled>
              Finalizar compra
            </span>
            <span className="text-xs text-[#F2B8B5]">Corrija os artigos assinalados para continuar.</span>
          </>
        )}
      </aside>
    </div>
  );
}
