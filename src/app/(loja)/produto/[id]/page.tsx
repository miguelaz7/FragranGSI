import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { getCatalog, stockLabel, type CatalogProduct } from "@/lib/catalog";
import { formatEur } from "@/lib/format";
import { ProductCard, stockColor } from "@/components/loja/ProductCard";
import { ProductImage } from "@/components/loja/ProductImage";
import { CatalogError } from "@/components/loja/CatalogError";
import { AddToCart } from "@/components/loja/AddToCart";

export const metadata: Metadata = { title: "Perfume" };

const GENDER_LABEL: Record<string, string> = { mulher: "Mulher", homem: "Homem", unissexo: "Unissexo" };

const PYRAMID = [
  { key: "topNotes", title: "Notas de topo", hint: "O primeiro impacto, nos minutos iniciais." },
  { key: "heartNotes", title: "Notas de coração", hint: "A personalidade do perfume, ao longo de horas." },
  { key: "baseNotes", title: "Notas de fundo", hint: "O rasto que fica na pele até ao fim do dia." },
] as const;

export default function ProdutoPage({ params }: PageProps<"/produto/[id]">) {
  return (
    <Suspense fallback={<p className="py-10 text-loja-muted">A carregar perfume…</p>}>
      <Product params={params} />
    </Suspense>
  );
}

async function Product({ params }: { params: PageProps<"/produto/[id]">["params"] }) {
  await connection();
  // O id é o nº de material SAP (ex.: PERF001-093)
  const id = decodeURIComponent((await params).id);

  // Usa o mesmo catálogo em cache da listagem: produto, preço e stock do SAP
  let catalog: CatalogProduct[];
  try {
    catalog = await getCatalog();
  } catch {
    return (
      <div className="py-10">
        <CatalogError />
      </div>
    );
  }

  const product = catalog.find((p) => p.sapProduct === id);
  if (!product) notFound();
  const { info } = product;

  // No SAP cada tamanho é um material diferente: os "tamanhos" são os
  // materiais com o mesmo nome e outro volume
  const sizes = info
    ? catalog
        .filter((p) => p.name === product.name && p.info && p.info.concentration === info.concentration)
        .sort((a, b) => a.info!.sizeMl - b.info!.sizeMl)
    : [];

  // Sugestões: mesma família olfativa (primeira palavra), senão outros em stock
  const familyWord = info?.family.split(" ")[0].toLowerCase();
  const others = catalog.filter((p) => p.name !== product.name && p.stockStatus !== "out");
  const sameFamily = others.filter((p) => familyWord && p.info?.family.toLowerCase().includes(familyWord));
  const related = (sameFamily.length > 0 ? sameFamily : others).slice(0, 4);

  const canBuy = product.price !== null && product.stockStatus !== "out";

  return (
    <div className="flex flex-col gap-20 py-10">
      <nav aria-label="Caminho" className="text-sm text-loja-muted">
        <Link href="/" className="hover:text-ouro">Início</Link> /{" "}
        <Link href="/catalogo" className="hover:text-ouro">Perfumes</Link> / {product.name}
      </nav>

      <section className="-mt-12 flex flex-wrap gap-12">
        <div className="flex-[1_1_420px]">
          <ProductImage src={info?.imageUrl} large />
        </div>

        <div className="flex flex-[1_1_380px] flex-col gap-7">
          <div className="flex flex-col gap-3">
            {info && (
              <span className="text-xs uppercase tracking-[0.2em] text-ouro">
                {info.family} · {GENDER_LABEL[info.gender] ?? info.gender}
              </span>
            )}
            <h1 className="font-serif text-[clamp(36px,4.5vw,56px)] leading-[1.05]">{product.name}</h1>
            {info && <span className="text-loja-muted">{info.concentration}</span>}
          </div>

          <div className="flex items-baseline gap-3">
            {product.price !== null ? (
              <>
                <span className="text-3xl font-semibold">{formatEur(product.price)}</span>
                <span className="text-sm text-loja-muted">IVA incluído</span>
              </>
            ) : (
              <span className="text-loja-muted">Preço indisponível de momento</span>
            )}
          </div>

          {info?.description && <p className="max-w-[520px] leading-relaxed text-loja-muted">{info.description}</p>}

          {sizes.length > 0 && (
            <fieldset className="flex flex-col gap-3">
              <legend className="mb-3 text-sm text-loja-muted">Tamanho</legend>
              <div className="flex flex-wrap gap-2">
                {sizes.map((s) =>
                  s.sapProduct === product.sapProduct ? (
                    <span key={s.sapProduct} aria-current="true" className="flex h-11 items-center bg-ouro px-5 text-sm font-semibold text-loja-bg">
                      {s.info!.sizeMl} ml
                    </span>
                  ) : (
                    <Link
                      key={s.sapProduct}
                      href={`/produto/${encodeURIComponent(s.sapProduct)}`}
                      className="flex h-11 items-center border border-[#4A443B] px-5 text-sm hover:border-ouro hover:text-ouro"
                    >
                      {s.info!.sizeMl} ml
                    </Link>
                  ),
                )}
              </div>
            </fieldset>
          )}

          <span className={`flex items-center gap-2 text-sm ${stockColor[product.stockStatus]}`}>
            {product.stockStatus === "out" ? "○" : "●"} {stockLabel[product.stockStatus]}
            {product.stockStatus !== "out" && (
              <span className="text-loja-muted">
                · {product.stock} {product.stock === 1 ? "unidade disponível" : "unidades disponíveis"}
              </span>
            )}
          </span>

          {canBuy ? (
            <AddToCart sapProduct={product.sapProduct} maxQuantity={product.stock} />
          ) : (
            <button type="button" disabled className="h-13 bg-ouro px-8 text-[15px] font-semibold text-loja-bg opacity-50 sm:self-start">
              Indisponível
            </button>
          )}

          <dl className="flex flex-col border-t border-loja-line text-sm">
            <div className="flex justify-between gap-4 border-b border-loja-line py-3">
              <dt className="text-loja-muted">Referência</dt>
              <dd>{product.sapProduct}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-loja-line py-3">
              <dt className="text-loja-muted">Fatura</dt>
              <dd>Emitida no momento da compra</dd>
            </div>
          </dl>
        </div>
      </section>

      {info && (
        <section aria-labelledby="piramide" className="flex flex-col gap-8">
          <h2 id="piramide" className="font-serif text-4xl">Pirâmide olfativa</h2>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">
            {PYRAMID.map((level) => (
              <div key={level.key} className="flex flex-col gap-3 border border-loja-line p-7">
                <span className="text-xs uppercase tracking-[0.18em] text-ouro">{level.title}</span>
                <span className="font-serif text-2xl">{info[level.key]}</span>
                <span className="text-sm text-loja-muted">{level.hint}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {related.length > 0 && (
        <section className="flex flex-col gap-8">
          <h2 className="font-serif text-4xl">Se gosta deste, vai gostar de…</h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-x-6 gap-y-12">
            {related.map((p) => <ProductCard key={p.sapProduct} product={p} />)}
          </div>
        </section>
      )}
    </div>
  );
}
