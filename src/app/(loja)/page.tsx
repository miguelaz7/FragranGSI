import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { getStoreCatalog } from "@/lib/catalog";
import { ProductCard } from "@/components/loja/ProductCard";
import { CatalogError } from "@/components/loja/CatalogError";
import { Logo } from "@/components/loja/Header";

const families = [
  { name: "Amadeirado", notes: "Cedro, vetiver, sândalo" },
  { name: "Floral", notes: "Rosa, jasmim, íris" },
  { name: "Cítrico", notes: "Bergamota, limão, néroli" },
  { name: "Oriental", notes: "Âmbar, baunilha, especiarias" },
];

const assistantChips = ["Para a noite", "Notas amadeiradas", "Intensidade moderada", "Para oferecer"];

const promises = [
  { title: "Stock atualizado", text: "Sabe sempre o que está disponível antes de comprar." },
  { title: "Fatura automática", text: "Recebe a fatura por email assim que a encomenda é confirmada." },
  { title: "Devoluções simples", text: "Peça a devolução na sua conta, sem complicações." },
];

const btnPrimary =
  "inline-flex h-13 items-center bg-ouro px-7 text-[15px] font-semibold text-loja-bg hover:bg-ouro/90";
const btnSecondary =
  "inline-flex h-13 items-center border border-[#4A443B] px-7 text-[15px] font-medium hover:border-ouro hover:text-ouro";

// Perfumes marcados "Em destaque" no backoffice (preço e stock do SAP, cache ~1 min).
// Se nenhum estiver marcado, a secção não aparece: a página inicial segue
// sempre a escolha do backoffice.
// Fica dentro de <Suspense>: o resto da página é pré-gerado e aparece logo.
async function FeaturedSection() {
  // Ler o catálogo no pedido e não no build (o build não deve depender do SAP)
  await connection();
  let catalog;
  try {
    catalog = await getStoreCatalog();
  } catch {
    return (
      <section className="pb-24">
        <CatalogError />
      </section>
    );
  }
  const featured = catalog.filter((p) => p.info?.featured).slice(0, 4);
  if (featured.length === 0) return null;
  return (
    <section className="flex flex-col gap-8 pb-24">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h2 className="font-serif text-4xl">Em destaque</h2>
        <Link href="/catalogo" className="text-sm text-ouro hover:underline">Ver todos os perfumes →</Link>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-x-6 gap-y-12">
        {featured.map((p) => <ProductCard key={p.sapProduct} product={p} />)}
      </div>
    </section>
  );
}

export default function Home() {
  return (
    <>
      <section className="flex flex-wrap items-center gap-12 pt-20 pb-24">
        <div className="flex flex-[1_1_420px] flex-col gap-7">
          <span className="text-xs uppercase tracking-[0.24em] text-ouro">Perfumaria de autor</span>
          <h1 className="font-serif text-[clamp(44px,6vw,80px)] leading-[1.05]">
            Encontre a fragrância que diz quem é.
          </h1>
          <p className="max-w-[480px] text-[17px] leading-relaxed text-loja-muted">
            Uma seleção de perfumes de autor, com stock em tempo real e fatura emitida no momento da compra.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/catalogo" className={btnPrimary}>Ver perfumes</Link>
            <Link href="/assistente" className={btnSecondary}>Descobrir com o assistente</Link>
          </div>
        </div>
        <div className="relative flex h-[560px] flex-[1_1_420px] items-center justify-center overflow-hidden bg-loja-surface">
          <div className="absolute inset-x-[30%] top-[18%] bottom-[14%] border border-loja-line bg-gradient-to-b from-[#2A2520] to-loja-bg" aria-hidden />
          <div className="relative opacity-80"><Logo /></div>
        </div>
      </section>

      <section className="flex flex-col gap-8 pb-24">
        <h2 className="font-serif text-4xl">Explorar por família olfativa</h2>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
          {families.map((f) => (
            <Link
              key={f.name}
              href={`/catalogo?familia=${encodeURIComponent(f.name)}`}
              className="flex flex-col gap-2 border border-loja-line p-7 hover:border-ouro"
            >
              <span className="font-serif text-2xl">{f.name}</span>
              <span className="text-sm text-loja-muted">{f.notes}</span>
            </Link>
          ))}
        </div>
      </section>

      <Suspense fallback={null}>
        <FeaturedSection />
      </Suspense>

      <section className="flex flex-wrap items-center gap-12 border border-loja-line bg-loja-surface p-[clamp(28px,5vw,64px)]">
        <div className="flex flex-[1_1_380px] flex-col gap-5">
          <span className="text-xs uppercase tracking-[0.24em] text-ouro">Assistente de fragrâncias</span>
          <h2 className="font-serif text-4xl">Não sabe por onde começar?</h2>
          <p className="max-w-[460px] leading-relaxed text-loja-muted">
            Responda a três perguntas e o assistente sugere perfumes do nosso catálogo, apenas entre os que estão disponíveis.
          </p>
          <Link href="/assistente" className={`${btnPrimary} self-start`}>Começar</Link>
        </div>
        <div className="flex flex-[1_1_300px] flex-wrap gap-3">
          {assistantChips.map((c) => (
            <span key={c} className="rounded-full border border-loja-line px-5 py-2.5 text-sm text-loja-muted">{c}</span>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-8 py-24">
        {promises.map((p) => (
          <div key={p.title} className="flex flex-col gap-2 border-t border-loja-line pt-6">
            <span className="font-serif text-xl">{p.title}</span>
            <span className="text-sm leading-relaxed text-loja-muted">{p.text}</span>
          </div>
        ))}
      </section>
    </>
  );
}
