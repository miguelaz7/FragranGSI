import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { getStoreCatalog, type CatalogProduct } from "@/lib/catalog";
import { CONCENTRATIONS, FAMILIES, GENDERS } from "@/lib/product-options";
import { ProductCard } from "@/components/loja/ProductCard";
import { CatalogError } from "@/components/loja/CatalogError";
import { FilterForm } from "@/components/loja/FilterForm";

export const metadata: Metadata = { title: "Perfumes" };

// Os filtros vivem no URL (?genero=mulher&familia=Floral…): um formulário GET
// (FilterForm). Os links do cabeçalho e da página inicial usam os mesmos parâmetros.
type Filters = {
  q: string;
  genero: string[];
  familia: string[];
  concentracao: string[];
  stock: boolean;
  ordenar: string;
};

const SORTS = [
  { value: "nome", label: "Nome" },
  { value: "preco-asc", label: "Preço: mais baixo" },
  { value: "preco-desc", label: "Preço: mais alto" },
];

function asList(v: string | string[] | undefined) {
  return v === undefined ? [] : Array.isArray(v) ? v : [v];
}

function parseFilters(sp: Record<string, string | string[] | undefined>): Filters {
  return {
    q: (asList(sp.q)[0] ?? "").trim(),
    genero: asList(sp.genero),
    familia: asList(sp.familia),
    concentracao: asList(sp.concentracao),
    stock: sp.stock === "1",
    ordenar: asList(sp.ordenar)[0] ?? "nome",
  };
}

const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

function applyFilters(products: CatalogProduct[], f: Filters) {
  const result = products.filter((p) => {
    const info = p.info;
    if (f.stock && p.stockStatus === "out") return false;
    if (f.genero.length && !(info && f.genero.includes(info.gender))) return false;
    // "Amadeirado" apanha também "Oriental amadeirado"
    if (f.familia.length && !(info && f.familia.some((fam) => norm(info.family).includes(norm(fam))))) return false;
    if (f.concentracao.length && !(info && f.concentracao.includes(info.concentration))) return false;
    if (f.q) {
      const text = norm([p.name, info?.family, info?.topNotes, info?.heartNotes, info?.baseNotes].join(" "));
      if (!text.includes(norm(f.q))) return false;
    }
    return true;
  });
  // Produtos sem preço vão sempre para o fim
  const price = (p: CatalogProduct, dir: 1 | -1) => p.price ?? dir * Infinity;
  if (f.ordenar === "preco-asc") result.sort((a, b) => price(a, 1) - price(b, 1));
  if (f.ordenar === "preco-desc") result.sort((a, b) => price(b, -1) - price(a, -1));
  return result;
}

export default function CatalogoPage({ searchParams }: PageProps<"/catalogo">) {
  return (
    <div className="flex flex-col gap-8 py-10">
      <nav aria-label="Caminho" className="text-sm text-loja-muted">
        <Link href="/" className="hover:text-ouro">Início</Link> / Perfumes
      </nav>
      <Suspense fallback={<p className="text-loja-muted">A carregar perfumes…</p>}>
        <Catalog searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Catalog({ searchParams }: { searchParams: PageProps<"/catalogo">["searchParams"] }) {
  await connection();
  const filters = parseFilters(await searchParams);

  let catalog: CatalogProduct[];
  try {
    catalog = await getStoreCatalog();
  } catch {
    return <CatalogError />;
  }
  const products = applyFilters(catalog, filters);

  return (
    // key: quando os filtros do URL mudam (ex.: clique em "Unissexo" no cabeçalho),
    // o formulário é recriado e as caixas mostram o filtro aplicado
    <FilterForm key={JSON.stringify(filters)} className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="font-serif text-5xl">Perfumes</h1>
          <span className="text-sm text-loja-muted">
            {products.length} de {catalog.length} perfumes
          </span>
        </div>
        <div className="flex flex-wrap items-end gap-3 text-sm">
          <label className="flex flex-col gap-1.5 text-loja-muted">
            Pesquisar perfumes
            <input
              type="search"
              name="q"
              defaultValue={filters.q}
              placeholder="Nome ou nota…"
              className="h-11 w-64 border border-loja-line bg-loja-surface px-3 text-loja-text placeholder:text-loja-muted focus:border-ouro focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-loja-muted">
            Ordenar
            <select
              name="ordenar"
              defaultValue={filters.ordenar}
              className="h-11 border border-loja-line bg-loja-surface px-3 text-loja-text focus:border-ouro focus:outline-none"
            >
              {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </label>
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-10">
        <aside aria-label="Filtros" className="flex flex-[1_1_200px] flex-col gap-7 text-sm lg:max-w-[240px]">
          <FilterGroup legend="Género" name="genero" options={GENDERS} checked={filters.genero} />
          <FilterGroup legend="Família olfativa" name="familia" options={FAMILIES.map((f) => ({ value: f, label: f }))} checked={filters.familia} />
          <FilterGroup legend="Concentração" name="concentracao" options={CONCENTRATIONS.map((c) => ({ value: c, label: c }))} checked={filters.concentracao} />
          <label className="flex items-center gap-3">
            <input type="checkbox" name="stock" value="1" defaultChecked={filters.stock} className="size-4 accent-ouro" />
            Só perfumes em stock
          </label>
          <div className="flex flex-wrap gap-3">
            {/* Só é preciso sem JavaScript: com JS os filtros aplicam-se ao mudar */}
            <noscript>
              <button type="submit" className="h-11 bg-ouro px-5 font-semibold text-loja-bg hover:bg-ouro/90">Aplicar filtros</button>
            </noscript>
            <Link href="/catalogo" className="flex h-11 items-center border border-loja-line px-5 hover:border-ouro hover:text-ouro">Limpar filtros</Link>
          </div>
        </aside>

        <div className="flex-[999_1_480px]">
          {products.length > 0 ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-x-6 gap-y-12">
              {products.map((p) => <ProductCard key={p.sapProduct} product={p} />)}
            </div>
          ) : (
            <p className="text-loja-muted">
              {catalog.length === 0 ? "Ainda não há perfumes no catálogo." : "Nenhum perfume corresponde aos filtros escolhidos."}
            </p>
          )}
        </div>
      </div>
    </FilterForm>
  );
}

function FilterGroup({ legend, name, options, checked }: {
  legend: string;
  name: string;
  options: { value: string; label: string }[];
  checked: string[];
}) {
  return (
    <fieldset className="flex flex-col gap-2.5">
      <legend className="mb-2 text-xs uppercase tracking-[0.18em] text-ouro">{legend}</legend>
      {options.map((o) => (
        <label key={o.value} className="flex items-center gap-3">
          <input type="checkbox" name={name} value={o.value} defaultChecked={checked.includes(o.value)} className="size-4 accent-ouro" />
          {o.label}
        </label>
      ))}
    </fieldset>
  );
}
