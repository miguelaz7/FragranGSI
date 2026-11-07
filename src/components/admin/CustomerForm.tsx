"use client";

import { createCustomer, saveCustomer } from "@/app/admin/clientes/actions";
import { useKeptForm } from "@/lib/use-kept-form";

const input =
  "h-10 w-full border border-[#D4D0C8] bg-admin-card px-3 text-sm focus:border-admin-text focus:outline-none aria-[invalid=true]:border-erro";
const label = "flex flex-col gap-1.5 text-[13px] font-semibold";

const fields = [
  { name: "name", label: "Nome completo", autoComplete: "off", maxLength: 80 },
  { name: "email", label: "Email", type: "email", autoComplete: "off" },
  { name: "nif", label: "NIF (opcional)", inputMode: "numeric", maxLength: 11, hint: "Sem NIF, a fatura sai como consumidor final." },
  { name: "address", label: "Morada", autoComplete: "off", maxLength: 60 },
  { name: "postalCode", label: "Código postal", placeholder: "4700-000", autoComplete: "off" },
  { name: "city", label: "Localidade", autoComplete: "off", maxLength: 40 },
] as const;

type Customer = { id: string; name: string; email: string; nif: string | null; address: string | null; postalCode: string | null; city: string | null };

// Sem "customer" cria um cliente novo; com "customer" edita-o
export function CustomerForm({ customer }: { customer?: Customer }) {
  const { state, action, pending, formRef, onSubmit } = useKeptForm(customer ? saveCustomer : createCustomer);
  const err = state?.errors ?? {};

  return (
    <form ref={formRef} action={action} onSubmit={onSubmit} className="flex flex-col gap-5">
      {customer && <input type="hidden" name="id" value={customer.id} />}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] items-start gap-4">
        {fields.map(({ name, label: text, ...rest }) => {
          const { hint, ...attrs } = rest as typeof rest & { hint?: string };
          return (
            <label key={name} className={label}>
              {text}
              <input
                name={name}
                {...attrs}
                defaultValue={customer?.[name] ?? ""}
                aria-invalid={err[name] ? true : undefined}
                aria-describedby={err[name] ? `${name}-erro` : undefined}
                className={input}
              />
              {err[name] ? (
                <span id={`${name}-erro`} className="text-xs font-normal text-erro">{err[name]}</span>
              ) : (
                hint && <span className="text-xs font-normal text-admin-muted">{hint}</span>
              )}
            </label>
          );
        })}
      </div>
      {state?.message && !state.errors && (
        <p role={state.ok ? "status" : "alert"} className={`text-sm ${state.ok ? "text-sucesso" : "text-erro"}`}>{state.message}</p>
      )}
      <div>
        <button
          type="submit"
          disabled={pending}
          className="flex h-10 items-center border border-admin-text bg-admin-text px-4 text-[13px] font-semibold text-white hover:bg-black disabled:opacity-60"
        >
          {pending ? "A gravar no Moloni e no SAP…" : customer ? "Guardar alterações" : "Criar cliente"}
        </button>
      </div>
    </form>
  );
}
