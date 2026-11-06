import type { Metadata } from "next";
import Link from "next/link";
import { ProductForm } from "@/components/admin/ProductForm";

export const metadata: Metadata = { title: "Novo produto" };

// Novo produto guiado: cria a ficha da loja; o material é criado à mão no SAP
// (a criação por API ainda não está ligada aqui — ver CLAUDE.md). Quando o material
// aparecer no SAP com o mesmo código, fica ligado a esta ficha.
export default function NovoProdutoPage() {
  return (
    <>
      <div className="flex flex-col gap-1">
        <Link href="/admin/produtos" className="text-sm text-admin-muted hover:text-admin-text">← Produtos</Link>
        <h1 className="text-[28px] font-bold">Novo produto</h1>
        <span className="max-w-[640px] text-sm text-admin-muted">
          Preencha a ficha da loja. A seguir, o backoffice indica os passos para criar o material, o stock e o preço no SAP.
          O perfume aparece na loja quando existir no SAP com o mesmo código.
        </span>
      </div>
      <section className="border border-admin-line bg-admin-card p-[22px]">
        <ProductForm mode="novo" />
      </section>
    </>
  );
}
