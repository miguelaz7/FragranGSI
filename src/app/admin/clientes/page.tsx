import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { DeleteCustomerButton } from "@/components/admin/DeleteCustomerButton";
import { syncSapDrafts } from "@/lib/customers";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Clientes" };

const button = "flex h-10 items-center border border-admin-text bg-admin-text px-4 text-[13px] font-semibold text-white hover:bg-black";
const badge = "rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap";
const ok = `${badge} bg-[#DDF0E4] text-[#14532D]`;
const waiting = `${badge} bg-[#FDF0D5] text-[#6B4500]`;
const failed = `${badge} bg-[#F9DEDC] text-[#5C0F0B]`;

type Search = Promise<{ criado?: string; moloni?: string; sap?: string; apagado?: string; parceiro?: string }>;

export default function ClientesPage({ searchParams }: { searchParams: Search }) {
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-[28px] font-bold">Clientes</h1>
          <span className="text-sm text-admin-muted">
            Cada cliente é criado no Moloni e ativado no SAP. Se a ativação falhar, fica em rascunho no SAP.
          </span>
        </div>
        <Link href="/admin/clientes/novo" className={button}>Novo cliente</Link>
      </div>
      <Suspense>
        <Result searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={<p className="text-sm text-admin-muted">A ler clientes…</p>}>
        <CustomerTable />
      </Suspense>
    </>
  );
}

async function Result({ searchParams }: { searchParams: Search }) {
  const { criado, moloni, sap, apagado, parceiro } = await searchParams;
  if (apagado) {
    return (
      <p role="status" className="border border-[#B7DCC4] bg-admin-card p-4 text-sm text-sucesso">
        Cliente apagado da loja e do Moloni.
        {parceiro && ` O parceiro ${parceiro} continua no SAP: já estava ativo e não se apaga por API.`}
      </p>
    );
  }
  if (!criado) return null;
  const allOk = moloni === "1" && sap === "1";
  return (
    <p role="status" className={`border bg-admin-card p-4 text-sm ${allOk ? "border-[#B7DCC4] text-sucesso" : "border-[#F2B8B5] text-erro"}`}>
      {allOk ? (
        "Cliente criado no Moloni e no SAP."
      ) : (
        <>
          Cliente guardado, mas falhou {moloni !== "1" && sap !== "1" ? "o Moloni e o SAP" : moloni !== "1" ? "o Moloni" : "o SAP"}.{" "}
          Pode repetir no <Link href="/admin/integracao?filtro=erros" className="underline">monitor de integração</Link>.
        </>
      )}
    </p>
  );
}

async function CustomerTable() {
  await connection();
  // Se o SAP falhar, mostra o último estado conhecido; o erro fica no monitor de integração
  await syncSapDrafts().catch(() => {});
  const customers = await db.user.findMany({ where: { isDemo: false, role: "customer" }, orderBy: { createdAt: "desc" } });

  if (customers.length === 0) return <p className="text-sm text-admin-muted">Ainda não há clientes.</p>;

  return (
    <div className="overflow-x-auto border border-admin-line bg-admin-card">
      <table className="w-full min-w-[1080px] text-left text-sm">
        <thead className="text-xs text-admin-muted">
          <tr className="border-b border-admin-line">
            {["Nome", "Email", "NIF", "Localidade", "Moloni", "SAP", "Acesso à loja", ""].map((h) => (
              <th key={h} className="px-4 py-2.5 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {customers.map((c) => (
            <tr key={c.id} className="border-b border-admin-line last:border-0">
              <td className="px-4 py-3 font-semibold">{c.name}</td>
              <td className="px-4 py-3">{c.email}</td>
              <td className="px-4 py-3 tabular-nums">{c.nif ?? "—"}</td>
              <td className="px-4 py-3">{c.city ?? "—"}</td>
              <td className="px-4 py-3">
                {c.moloniCustomerId ? <span className={ok}>Criado</span> : <span className={failed}>Falhou</span>}
              </td>
              <td className="px-4 py-3">
                {c.sapBusinessPartner ? (
                  <span className={ok}>{c.sapBusinessPartner}</span>
                ) : c.sapDraftUuid ? (
                  <span className={waiting}>Rascunho</span>
                ) : (
                  <span className={failed}>Sem registo</span>
                )}
              </td>
              <td className="px-4 py-3">
                {c.passwordHash ? <span className={ok}>Com acesso</span> : <span className={waiting}>Sem acesso</span>}
              </td>
              <td className="flex items-center justify-end gap-4 px-4 py-3">
                <Link href={`/admin/clientes/${c.id}`} className="font-semibold underline">Editar</Link>
                <DeleteCustomerButton id={c.id} name={c.name} sapBusinessPartner={c.sapBusinessPartner} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
