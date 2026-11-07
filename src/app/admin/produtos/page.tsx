import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { getCatalog, isInfoComplete, type AdminProduct } from "@/lib/catalog";
import { formatEur } from "@/lib/format";
import { syncCatalogNow } from "../integracao/actions";
import { setFeatured, setVisible } from "./actions";

export const metadata: Metadata = { title: "Produtos" };

const button = "flex h-10 items-center border border-[#D4D0C8] bg-admin-card px-4 text-[13px] font-semibold hover:border-admin-text";
const badge = "rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap";
const toggle = "h-8 whitespace-nowrap border px-3 text-xs font-semibold hover:border-admin-text";

export default function ProdutosPage() {
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-[28px] font-bold">Produtos</h1>
          <span className="text-sm text-admin-muted">
            A loja lê do Moloni. O preço altera-se na ficha de cada produto e sincronizar passa para o Moloni os produtos e as entradas de stock do SAP.
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <form action={syncCatalogNow}><button type="submit" className={button}>Sincronizar com o SAP</button></form>
          <Link href="/admin/produtos/novo" className={`${button} border-admin-text bg-admin-text text-white hover:bg-black`}>Novo produto</Link>
        </div>
      </div>
      <Suspense fallback={<p className="text-sm text-admin-muted">A ler produtos do SAP…</p>}>
        <ProductTable />
      </Suspense>
    </>
  );
}

type Row = { sapProduct: string; sap: AdminProduct | null; info: AdminProduct["info"] };

async function ProductTable() {
  await connection();
  let catalog: AdminProduct[];
  try {
    catalog = await getCatalog();
  } catch {
    return (
      <p className="border border-admin-line bg-admin-card p-6 text-sm text-erro">
        Não foi possível ler os produtos do SAP. Ver o <Link href="/admin/integracao?filtro=erros" className="underline">monitor de integração</Link>.
      </p>
    );
  }

  // Fichas criadas no backoffice para materiais que ainda não existem no SAP
  const sapCodes = new Set(catalog.map((p) => p.sapProduct));
  const waiting = await db.productInfo.findMany({ where: { sapProduct: { notIn: [...sapCodes] } } });

  const rows: Row[] = [
    ...catalog.map((p) => ({ sapProduct: p.sapProduct, sap: p, info: p.info })),
    ...waiting.map(({ sapProduct, ...info }) => ({ sapProduct, sap: null, info })),
  ];

  if (rows.length === 0) return <p className="text-sm text-admin-muted">Ainda não há perfumes no SAP nem fichas criadas.</p>;

  return (
    <div className="overflow-x-auto border border-admin-line bg-admin-card">
      <table className="w-full min-w-[1060px] text-left text-sm">
        <thead className="text-xs text-admin-muted">
          <tr className="border-b border-admin-line">
            {["Código SAP", "Nome (SAP)", "Preço", "Stock (Moloni)", "Entradas (SAP)", "Ficha da loja", "Destaque", "Na loja", ""].map((h) => (
              <th key={h} className="px-4 py-2.5 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ sapProduct, sap, info }) => (
            <tr key={sapProduct} className="border-b border-admin-line last:border-0">
              <td className="px-4 py-3 font-semibold tabular-nums">{sapProduct}</td>
              <td className="px-4 py-3">{sap ? sap.name : <span className="text-admin-muted">Ainda não existe no SAP</span>}</td>
              <td className="px-4 py-3">
                {sap?.price != null ? formatEur(sap.price) : sap ? <span className="text-erro">Sem preço PR00</span> : "—"}
              </td>
              <td className="px-4 py-3 tabular-nums">
                {!sap ? "—" : sap.stock <= 0 ? <span className="font-semibold text-erro">Esgotado</span> : sap.stockStatus === "low" ? <span className="font-semibold text-[#9A5B00]">{sap.stock} un.</span> : `${sap.stock} un.`}
              </td>
              <td className="px-4 py-3 tabular-nums text-admin-muted">{sap ? `${sap.sapStock} un.` : "—"}</td>
              <td className="px-4 py-3">
                {isInfoComplete(info) ? (
                  <span className={`${badge} bg-[#DDF0E4] text-[#14532D]`}>Completa</span>
                ) : (
                  <span className={`${badge} bg-[#FDF0D5] text-[#6B4500]`}>Por completar</span>
                )}
              </td>
              {/* Ações rápidas: um clique, sem abrir a ficha. Precisam da ficha (é lá que se guardam). */}
              <td className="px-4 py-3">
                {info ? (
                  <form action={setFeatured}>
                    <input type="hidden" name="sapProduct" value={sapProduct} />
                    <input type="hidden" name="featured" value={info.featured ? "0" : "1"} />
                    <button
                      type="submit"
                      aria-pressed={info.featured}
                      title={info.featured ? "Tirar da página inicial" : "Mostrar na página inicial"}
                      className={`${toggle} ${info.featured ? "border-[#C9A96E] bg-[#FBF6EA] text-[#7A5C24]" : "border-[#D4D0C8] text-admin-muted"}`}
                    >
                      {info.featured ? "★ Em destaque" : "☆ Destacar"}
                    </button>
                  </form>
                ) : (
                  <span className="text-admin-muted">—</span>
                )}
              </td>
              <td className="px-4 py-3">
                {info ? (
                  <form action={setVisible} className="flex items-center gap-2">
                    <input type="hidden" name="sapProduct" value={sapProduct} />
                    <input type="hidden" name="visible" value={info.visible ? "0" : "1"} />
                    <button
                      type="submit"
                      aria-pressed={info.visible}
                      title={info.visible ? "Esconder da loja (o material continua no SAP)" : "Voltar a mostrar na loja"}
                      className={`${toggle} ${info.visible ? "border-[#B7DCC4] bg-[#DDF0E4] text-[#14532D]" : "border-[#D4D0C8] text-admin-muted"}`}
                    >
                      {info.visible ? "● Visível" : "○ Escondido"}
                    </button>
                    {!sap && <span className="text-xs text-admin-muted">à espera do SAP</span>}
                    {sap && sap.price == null && info.visible && <span className="text-xs text-admin-muted">fora da loja: sem preço</span>}
                  </form>
                ) : (
                  <span className="text-admin-muted">{sap ? "Fora da loja (sem ficha)" : "—"}</span>
                )}
              </td>
              <td className="px-4 py-3 text-right">
                <Link href={`/admin/produtos/${encodeURIComponent(sapProduct)}`} className="font-semibold underline">
                  {info ? "Editar" : "Criar ficha"}
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
