"use client";

import { useActionState } from "react";
import { removeCustomer } from "@/app/admin/clientes/actions";

type Props = { id: string; name: string; sapBusinessPartner: string | null };

export function DeleteCustomerButton({ id, name, sapBusinessPartner }: Props) {
  const [error, action, pending] = useActionState<string | null, FormData>(removeCustomer, null);
  const warning = sapBusinessPartner
    ? `Apagar "${name}" da loja e do Moloni? O parceiro ${sapBusinessPartner} continua no SAP.`
    : `Apagar "${name}" da loja, do Moloni e o rascunho do SAP?`;

  return (
    <form action={action} onSubmit={(e) => { if (!confirm(warning)) e.preventDefault(); }}>
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={pending} className="font-semibold text-erro underline disabled:opacity-60">
        {pending ? "A apagar…" : "Apagar"}
      </button>
      {error && <p role="alert" className="mt-1 max-w-[220px] text-left text-xs text-erro">{error}</p>}
    </form>
  );
}
