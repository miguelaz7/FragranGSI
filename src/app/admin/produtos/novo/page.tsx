import type { Metadata } from "next";
import Link from "next/link";
import { ProductForm } from "@/components/admin/ProductForm";

export const metadata: Metadata = { title: "Novo produto" };

// Novo produto: guarda a ficha da loja e cria no SAP o material, o preço e o stock
// inicial, e no Moloni o artigo.
export default function NovoProdutoPage() {
  return (
    <>
      <div className="flex flex-col gap-1">
        <Link href="/admin/produtos" className="text-sm text-admin-muted hover:text-admin-text">← Produtos</Link>
        <h1 className="text-[28px] font-bold">Novo produto</h1>
        <span className="max-w-[640px] text-sm text-admin-muted">
          Preencha a ficha da loja, o preço e o stock inicial. O material, o preço e a entrada de stock são criados no SAP
          e copiados para o artigo no Moloni; o perfume aparece na loja quando tiver preço.
        </span>
      </div>
      <section className="border border-admin-line bg-admin-card p-[22px]">
        <ProductForm mode="novo" />
      </section>
    </>
  );
}
