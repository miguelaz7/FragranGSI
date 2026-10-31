"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { addToCart, type AddToCartState } from "@/app/(loja)/carrinho/actions";

// Quantidade + botão "Adicionar ao carrinho" da página de produto.
// A validação (preço, stock) é feita no servidor, na Server Action.
export function AddToCart({ sapProduct, maxQuantity }: { sapProduct: string; maxQuantity: number }) {
  const [quantity, setQuantity] = useState(1);
  const [state, formAction, pending] = useActionState<AddToCartState, FormData>(addToCart, null);
  const max = Math.min(maxQuantity, 99);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="sapProduct" value={sapProduct} />
      <input type="hidden" name="quantity" value={quantity} />
      <div className="flex flex-wrap gap-3">
        <div className="flex h-13 items-center border border-[#4A443B]">
          <button
            type="button"
            aria-label="Diminuir quantidade"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            disabled={quantity <= 1}
            className="flex size-13 items-center justify-center text-xl hover:text-ouro disabled:opacity-40"
          >
            −
          </button>
          <span aria-live="polite" className="w-10 text-center">{quantity}</span>
          <button
            type="button"
            aria-label="Aumentar quantidade"
            onClick={() => setQuantity((q) => Math.min(max, q + 1))}
            disabled={quantity >= max}
            className="flex size-13 items-center justify-center text-xl hover:text-ouro disabled:opacity-40"
          >
            +
          </button>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="h-13 flex-1 bg-ouro px-8 text-[15px] font-semibold text-loja-bg hover:bg-ouro/90 disabled:opacity-60 sm:flex-none"
        >
          {pending ? "A adicionar…" : "Adicionar ao carrinho"}
        </button>
      </div>
      {state && (
        <p role="status" className={`text-sm ${state.ok ? "text-stock-ok" : "text-[#F2B8B5]"}`}>
          {state.message}{" "}
          {state.ok && <Link href="/carrinho" className="text-ouro underline">Ver carrinho</Link>}
        </p>
      )}
    </form>
  );
}
