"use client";

import { useActionState } from "react";
import { changePrice, type PriceFormState } from "@/app/admin/produtos/actions";

// Grava o preço no SAP e no Moloni de uma vez. Sem preço, cria o primeiro PR00.
// Também resolve um conflito, quando o preço mudou nos dois sistemas.
export function PriceForm({ sapProduct, price }: { sapProduct: string; price: number | null }) {
  const [state, action, pending] = useActionState<PriceFormState, FormData>(changePrice, null);

  return (
    <form action={action} className="flex flex-col gap-2 border-t border-admin-line pt-4">
      <input type="hidden" name="sapProduct" value={sapProduct} />
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
          {price != null ? "Novo preço de venda (com IVA)" : "Preço de venda (com IVA)"}
          <input
            name="price"
            inputMode="decimal"
            defaultValue={price?.toFixed(2)}
            aria-invalid={state && !state.ok ? true : undefined}
            className="h-10 w-40 border border-[#D4D0C8] bg-admin-card px-3 text-sm focus:border-admin-text focus:outline-none aria-[invalid=true]:border-erro"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="flex h-10 items-center border border-admin-text bg-admin-text px-4 text-[13px] font-semibold text-white hover:bg-black disabled:opacity-60"
        >
          {pending ? "A gravar no SAP e no Moloni…" : price != null ? "Alterar preço" : "Criar preço"}
        </button>
      </div>
      {state && <p role={state.ok ? "status" : "alert"} className={`text-sm ${state.ok ? "text-sucesso" : "text-erro"}`}>{state.message}</p>}
    </form>
  );
}
