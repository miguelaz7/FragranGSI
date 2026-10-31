import Link from "next/link";
import { Suspense } from "react";
import { getCartCount } from "@/lib/cart";

const nav = [
  { href: "/catalogo", label: "Perfumes" },
  { href: "/catalogo?genero=mulher", label: "Mulher" },
  { href: "/catalogo?genero=homem", label: "Homem" },
  { href: "/catalogo?genero=unissexo", label: "Unissexo" },
];

export function Logo() {
  return (
    <span className="font-serif text-[26px] tracking-[0.02em]">
      fragran<span className="text-ouro">GSI</span>
    </span>
  );
}

async function CartCount() {
  const count = await getCartCount();
  return (
    <>
      <span className="sr-only">Carrinho, {count} {count === 1 ? "artigo" : "artigos"}</span>
      {count > 0 && <span aria-hidden className="text-[13px]">{count}</span>}
    </>
  );
}

export function Header() {
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4 border-b border-loja-line px-4 py-5 sm:px-8 lg:px-12">
      <Link href="/" aria-label="fragranGSI, página inicial">
        <Logo />
      </Link>

      <nav aria-label="Principal" className="flex flex-wrap gap-x-7 gap-y-2 text-sm tracking-[0.04em]">
        {nav.map((item) => (
          <Link key={item.href} href={item.href} className="hover:text-ouro">
            {item.label}
          </Link>
        ))}
        <Link href="/assistente" className="text-ouro hover:underline">
          Encontrar o meu perfume
        </Link>
      </nav>

      <div className="flex items-center gap-1">
        <Link href="/catalogo" aria-label="Pesquisar" className="flex size-11 items-center justify-center hover:text-ouro">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
        </Link>
        <Link href="/conta" aria-label="Conta" className="flex size-11 items-center justify-center hover:text-ouro">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
          </svg>
        </Link>
        <Link href="/carrinho" className="flex h-11 items-center gap-1.5 px-2 hover:text-ouro">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
            <path d="M5 8h14l-1 13H6L5 8z" />
            <path d="M9 8V6a3 3 0 0 1 6 0v2" />
          </svg>
          {/* O contador lê o cookie do carrinho: fica à parte para o resto do cabeçalho ser estático */}
          <Suspense fallback={<span className="sr-only">Carrinho</span>}>
            <CartCount />
          </Suspense>
        </Link>
      </div>
    </header>
  );
}
