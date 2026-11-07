"use client";

import { useActionState } from "react";
import { setCustomerPassword } from "@/app/admin/clientes/actions";

// Sem recuperação automática de password, é aqui que se dá ou repõe o acesso à loja.
export function CustomerPasswordForm({ id }: { id: string }) {
  const [message, action, pending] = useActionState<string | null, FormData>(setCustomerPassword, null);

  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="id" value={id} />
      <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
        Nova palavra-passe
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          className="h-10 w-60 border border-[#D4D0C8] bg-admin-card px-3 text-sm font-normal focus:border-admin-text focus:outline-none"
        />
      </label>
      <button type="submit" disabled={pending} className="h-10 border border-admin-text px-4 text-[13px] font-semibold hover:bg-admin-bg disabled:opacity-60">
        {pending ? "A guardar…" : "Definir"}
      </button>
      {message && <span role="status" className="basis-full text-sm">{message}</span>}
    </form>
  );
}
