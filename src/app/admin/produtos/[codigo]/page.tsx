import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { getCatalog } from "@/lib/catalog";
import { formatEur } from "@/lib/format";
import { ProductForm } from "@/components/admin/ProductForm";
import { PriceForm } from "@/components/admin/PriceForm";
import { SapSteps } from "@/components/admin/SapSteps";
import { setVisible } from "../actions";

export const metadata: Metadata = { title: "Produto" };

const card = "flex flex-col gap-3 border border-admin-line bg-admin-card p-[22px]";

export default function ProdutoAdminPage({ params, searchParams }: PageProps<"/admin/produtos/[codigo]">) {
  return (
    <Suspense fallback={<p className="text-sm text-admin-muted">A carregar…</p>}>
      <Product params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Product({ params, searchParams }: Pick<PageProps<"/admin/produtos/[codigo]">, "params" | "searchParams">) {
  await connection();
  const sapProduct = decodeURIComponent((await params).codigo);
  const { criado, sap: sapResult } = await searchParams;
  const created = criado === "1";

  // Dados SAP: se o SAP falhar, ainda se consegue editar a ficha local
  let sap = null;
  let sapError = false;
  try {
    sap = (await getCatalog()).find((p) => p.sapProduct === sapProduct) ?? null;
  } catch {
    sapError = true;
  }
  const info = await db.productInfo.findUnique({ where: { sapProduct } });
  if (!sap && !info && !sapError) notFound();

  return (
    <>
      <div className="flex flex-col gap-1">
        <Link href="/admin/produtos" className="text-sm text-admin-muted hover:text-admin-text">← Produtos</Link>
        <h1 className="text-[28px] font-bold">{sap?.name ?? sapProduct}</h1>
        <span className="text-sm text-admin-muted">Material SAP {sapProduct}</span>
      </div>

      {created && sapResult !== "0" && (
        <p role="status" className="border border-[#B7DCC4] bg-[#DDF0E4] p-4 text-sm text-[#14532D]">
          Ficha e material criados. O perfume aparece na loja quando tiver preço.
        </p>
      )}
      {created && sapResult === "0" && (
        <p role="alert" className="border border-[#F2B8B5] bg-admin-card p-4 text-sm text-erro">
          A ficha foi guardada, mas falhou a criação do material no SAP. Pode repetir no{" "}
          <Link href="/admin/integracao?filtro=erros" className="underline">monitor de integração</Link>.
        </p>
      )}

      <section className={card}>
        <h2 className="text-base font-bold">Dados do SAP <span className="font-normal text-admin-muted">(o nome e o stock alteram-se no SAP)</span></h2>
        {sapError ? (
          <p className="text-sm text-erro">Não foi possível ler o SAP agora. Ver o monitor de integração.</p>
        ) : sap ? (
          <>
          <dl className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-4 text-sm">
            <div><dt className="text-admin-muted">Nome</dt><dd className="font-semibold">{sap.name}</dd></div>
            <div><dt className="text-admin-muted">Preço (PR00)</dt><dd className="font-semibold">{sap.price != null ? formatEur(sap.price) : "Sem preço"}</dd></div>
            <div><dt className="text-admin-muted">Entradas de stock (SAP)</dt><dd className="font-semibold">{sap.sapStock} un.</dd></div>
            <div><dt className="text-admin-muted">Stock de venda (Moloni)</dt><dd className="font-semibold">{sap.stock} un.</dd></div>
          </dl>
          {sap.price != null && <PriceForm sapProduct={sapProduct} price={sap.price} />}
          </>
        ) : (
          <p className="text-sm text-admin-muted">Este material ainda não existe no SAP (ou ainda não foi sincronizado).</p>
        )}
      </section>

      {!sapError && (
        <SapSteps sapProduct={sapProduct} missing={{ material: !sap, stock: !sap || sap.sapStock <= 0, price: !sap || sap.price == null }} />
      )}

      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-bold">Ficha da loja</h2>
          {info && (
            <form action={setVisible}>
              <input type="hidden" name="sapProduct" value={sapProduct} />
              <input type="hidden" name="visible" value={info.visible ? "0" : "1"} />
              <button type="submit" className={`h-9 border px-4 text-[13px] font-semibold ${info.visible ? "border-erro text-erro hover:bg-[#F9DEDC]" : "border-sucesso text-sucesso hover:bg-[#DDF0E4]"}`}>
                {info.visible ? "Esconder da loja" : "Voltar a mostrar na loja"}
              </button>
            </form>
          )}
        </div>
        {info && !info.visible && (
          <p className="text-sm text-admin-muted">Escondido: não aparece no catálogo nem pode ser comprado. O material continua no SAP.</p>
        )}
        <ProductForm mode="editar" sapProduct={sapProduct} info={info} />
      </section>
    </>
  );
}
