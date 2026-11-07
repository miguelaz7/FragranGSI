import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { CustomerForm } from "@/components/admin/CustomerForm";
import { CustomerPasswordForm } from "@/components/admin/CustomerPasswordForm";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Cliente" };

const card = "flex flex-col gap-4 border border-admin-line bg-admin-card p-[22px]";

export default function ClientePage({ params }: PageProps<"/admin/clientes/[id]">) {
  return (
    <Suspense fallback={<p className="text-sm text-admin-muted">A carregar…</p>}>
      <Customer params={params} />
    </Suspense>
  );
}

async function Customer({ params }: Pick<PageProps<"/admin/clientes/[id]">, "params">) {
  await connection();
  const { id } = await params;
  const customer = await db.user.findUnique({ where: { id } });
  if (!customer || customer.isDemo) notFound();

  return (
    <>
      <div className="flex flex-col gap-1">
        <Link href="/admin/clientes" className="text-sm text-admin-muted hover:text-admin-text">← Clientes</Link>
        <h1 className="text-[28px] font-bold">{customer.name}</h1>
        <span className="text-sm text-admin-muted">
          Moloni {customer.moloniCustomerId ?? "—"} · SAP {customer.sapBusinessPartner ?? (customer.sapDraftUuid ? "em rascunho" : "—")}
        </span>
      </div>
      <section className={card}>
        <div>
          <h2 className="text-base font-bold">Dados do cliente</h2>
          <p className="text-sm text-admin-muted">Ao guardar, as alterações seguem para o Moloni e para o SAP. O SAP não recebe o email nem o NIF.</p>
        </div>
        <CustomerForm
          customer={{ id: customer.id, name: customer.name, email: customer.email, nif: customer.nif, address: customer.address, postalCode: customer.postalCode, city: customer.city }}
        />
      </section>
      <section className={card}>
        <div>
          <h2 className="text-base font-bold">Acesso à loja</h2>
          <p className="text-sm text-admin-muted">
            {customer.passwordHash ? "Este cliente tem acesso. Definir uma palavra-passe nova termina as sessões dele." : "Este cliente ainda não tem acesso: defina uma palavra-passe para poder entrar."}
          </p>
        </div>
        <CustomerPasswordForm id={customer.id} />
      </section>
    </>
  );
}
