"use client";

import { useActionState } from "react";
import { createCustomer, type CustomerFormState } from "@/app/admin/clientes/actions";

const input =
  "h-10 w-full border border-[#D4D0C8] bg-admin-card px-3 text-sm focus:border-admin-text focus:outline-none aria-[invalid=true]:border-erro";
const label = "flex flex-col gap-1.5 text-[13px] font-semibold";

const fields = [
  { name: "name", label: "Nome completo", autoComplete: "name" },
  { name: "email", label: "Email", type: "email", autoComplete: "email" },
  { name: "nif", label: "NIF (opcional)", inputMode: "numeric", hint: "Sem NIF, a fatura sai como consumidor final." },
  { name: "address", label: "Morada", autoComplete: "street-address" },
  { name: "postalCode", label: "Código postal", placeholder: "4700-000", autoComplete: "postal-code" },
  { name: "city", label: "Localidade", autoComplete: "address-level2" },
] as const;

export function CustomerForm() {
  const [state, action, pending] = useActionState<CustomerFormState, FormData>(createCustomer, null);
  const err = state?.errors ?? {};

  return (
    <form action={action} className="flex flex-col gap-5">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">
        {fields.map(({ name, label: text, ...rest }) => {
          const { hint, ...attrs } = rest as typeof rest & { hint?: string };
          return (
            <label key={name} className={label}>
              {text}
              <input
                name={name}
                {...attrs}
                aria-invalid={err[name] ? true : undefined}
                aria-describedby={err[name] ? `${name}-erro` : undefined}
                className={input}
              />
              {hint && <span className="text-xs font-normal text-admin-muted">{hint}</span>}
              {err[name] && <span id={`${name}-erro`} className="text-xs font-normal text-erro">{err[name]}</span>}
            </label>
          );
        })}
      </div>
      {state?.message && <p role="alert" className="text-sm text-erro">{state.message}</p>}
      <div>
        <button
          type="submit"
          disabled={pending}
          className="flex h-10 items-center border border-admin-text bg-admin-text px-4 text-[13px] font-semibold text-white hover:bg-black disabled:opacity-60"
        >
          {pending ? "A criar no Moloni e no SAP…" : "Criar cliente"}
        </button>
      </div>
    </form>
  );
}
