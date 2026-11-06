import type { Metadata } from "next";
import Link from "next/link";
import { CustomerForm } from "@/components/admin/CustomerForm";

export const metadata: Metadata = { title: "Novo cliente" };

export default function NovoClientePage() {
  return (
    <>
      <div className="flex flex-col gap-1">
        <Link href="/admin/clientes" className="text-sm text-admin-muted hover:text-admin-text">← Clientes</Link>
        <h1 className="text-[28px] font-bold">Novo cliente</h1>
        <span className="max-w-[640px] text-sm text-admin-muted">
          O cliente é criado no Moloni e ativado no SAP. Depois de ativo, não se apaga do SAP.
        </span>
      </div>
      <section className="border border-admin-line bg-admin-card p-[22px]">
        <CustomerForm />
      </section>
    </>
  );
}
