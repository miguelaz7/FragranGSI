"use client";

import { useActionState } from "react";
import { addStock, type StockFormState } from "@/app/admin/produtos/actions";

// Entrada de stock: lança no SAP (como "Initial Entry of Stock" do Manage Stock)
// e copia a diferença para o Moloni, de onde a loja vende.
export function StockForm({ sapProduct }: { sapProduct: string }) {
  const [state, action, pending] = useActionState<StockFormState, FormData>(addStock, null);

  return (
    <form action={action} className="flex flex-col gap-2 border-t border-admin-line pt-4">
      <input type="hidden" name="sapProduct" value={sapProduct} />
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
          Entrada de stock (unidades)
          <input
            // key: depois de lançar, o campo volta a ficar vazio
            key={state?.ok ? state.message : "stock"}
            name="quantity"
            type="number"
            min={1}
            max={10000}
            required
            aria-invalid={state && !state.ok ? true : undefined}
            className="h-10 w-40 border border-[#D4D0C8] bg-admin-card px-3 text-sm focus:border-admin-text focus:outline-none aria-[invalid=true]:border-erro"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="flex h-10 items-center border border-admin-text bg-admin-text px-4 text-[13px] font-semibold text-white hover:bg-black disabled:opacity-60"
        >
          {pending ? "A lançar no SAP e no Moloni…" : "Lançar entrada"}
        </button>
      </div>
      <span className="text-xs text-admin-muted">Movimento 561 no SAP (centro HD00, depósito TG00). Não se anula a partir daqui.</span>
      {state && <p role={state.ok ? "status" : "alert"} className={`text-sm ${state.ok ? "text-sucesso" : "text-erro"}`}>{state.message}</p>}
    </form>
  );
}
