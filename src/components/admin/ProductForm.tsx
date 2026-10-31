"use client";

import { useActionState } from "react";
import { saveProduct, type ProductFormState } from "@/app/admin/produtos/actions";
import { CONCENTRATIONS, FAMILIES, GENDERS } from "@/lib/product-options";

type Info = {
  family: string;
  gender: string;
  concentration: string;
  sizeMl: number;
  topNotes: string;
  heartNotes: string;
  baseNotes: string;
  description: string;
  imageUrl: string | null;
  featured: boolean;
  visible: boolean;
};

const input =
  "h-10 w-full border border-[#D4D0C8] bg-admin-card px-3 text-sm focus:border-admin-text focus:outline-none aria-[invalid=true]:border-erro";
const label = "flex flex-col gap-1.5 text-[13px] font-semibold";

// Formulário da ficha da loja (BD local). Em modo "novo" pede também o código SAP.
export function ProductForm({ mode, sapProduct, info }: { mode: "novo" | "editar"; sapProduct?: string; info?: Info | null }) {
  const [state, action, pending] = useActionState<ProductFormState, FormData>(saveProduct, null);
  const err = state?.errors ?? {};

  const field = (name: string) => ({
    name,
    "aria-invalid": err[name] ? true : undefined,
    "aria-describedby": err[name] ? `${name}-erro` : undefined,
  });
  const error = (name: string) =>
    err[name] && <span id={`${name}-erro`} className="text-xs font-normal text-erro">{err[name]}</span>;

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="mode" value={mode} />

      {mode === "novo" ? (
        <label className={label}>
          Código do material no SAP
          <input {...field("sapProduct")} placeholder="PERF002-093" className={`${input} uppercase`} autoComplete="off" />
          <span className="text-xs font-normal text-admin-muted">Usar o mesmo código com que o material é (ou vai ser) criado no SAP.</span>
          {error("sapProduct")}
        </label>
      ) : (
        <input type="hidden" name="sapProduct" value={sapProduct} />
      )}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4">
        <label className={label}>
          Família olfativa
          <input {...field("family")} list="familias" defaultValue={info?.family} placeholder="ex.: Oriental amadeirado" className={input} />
          <datalist id="familias">
            {FAMILIES.map((f) => <option key={f} value={f} />)}
          </datalist>
          {error("family")}
        </label>
        <label className={label}>
          Género
          <select {...field("gender")} defaultValue={info?.gender ?? ""} className={input}>
            <option value="" disabled>Escolher…</option>
            {GENDERS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
          </select>
          {error("gender")}
        </label>
        <label className={label}>
          Concentração
          <select {...field("concentration")} defaultValue={info?.concentration ?? ""} className={input}>
            <option value="" disabled>Escolher…</option>
            {CONCENTRATIONS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          {error("concentration")}
        </label>
        <label className={label}>
          Tamanho (ml)
          <input {...field("sizeMl")} type="number" min={1} max={1000} defaultValue={info?.sizeMl} className={input} />
          {error("sizeMl")}
        </label>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
        <label className={label}>
          Notas de topo
          <input {...field("topNotes")} defaultValue={info?.topNotes} placeholder="ex.: Bergamota, pimenta rosa" className={input} />
          {error("topNotes")}
        </label>
        <label className={label}>
          Notas de coração
          <input {...field("heartNotes")} defaultValue={info?.heartNotes} className={input} />
          {error("heartNotes")}
        </label>
        <label className={label}>
          Notas de fundo
          <input {...field("baseNotes")} defaultValue={info?.baseNotes} className={input} />
          {error("baseNotes")}
        </label>
      </div>

      <label className={label}>
        Descrição
        <textarea {...field("description")} defaultValue={info?.description} rows={3} className={`${input} h-auto py-2`} />
        {error("description")}
      </label>

      <div className="flex flex-wrap items-end gap-5">
        {info?.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={info.imageUrl} alt="Foto atual" className="h-28 w-[90px] border border-admin-line object-cover" />
        )}
        <label className={label}>
          {info?.imageUrl ? "Substituir foto" : "Foto"}
          <input {...field("photo")} type="file" accept="image/jpeg,image/png,image/webp" className="text-sm font-normal" />
          <span className="text-xs font-normal text-admin-muted">JPG, PNG ou WebP, até 4 MB.</span>
          {error("photo")}
        </label>
      </div>

      <div className="flex flex-wrap gap-6 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="featured" defaultChecked={info?.featured} className="size-4" />
          Em destaque na página inicial
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="visible" defaultChecked={info?.visible ?? true} className="size-4" />
          Visível na loja
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" disabled={pending} className="h-10 bg-admin-text px-6 text-sm font-semibold text-white hover:bg-black disabled:opacity-60">
          {pending ? "A guardar…" : mode === "novo" ? "Criar ficha" : "Guardar ficha"}
        </button>
        {state && (
          <span role="status" className={`text-sm ${state.ok ? "text-sucesso" : "text-erro"}`}>{state.message}</span>
        )}
      </div>
    </form>
  );
}
