import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import { getCartCount } from "@/lib/cart";

export const metadata: Metadata = { title: "Finalizar compra" };

export default function CheckoutPage() {
  return (
    <div className="flex flex-col gap-8 py-10">
      <h1 className="font-serif text-5xl">Finalizar compra</h1>
      <Suspense fallback={<p className="text-loja-muted">A carregar…</p>}>
        <Checkout />
      </Suspense>
    </div>
  );
}

async function Checkout() {
  const [user, count] = await Promise.all([getCurrentUser(), getCartCount()]);

  if (count === 0) {
    return (
      <div className="flex flex-col items-start gap-5">
        <p className="text-loja-muted">O carrinho está vazio.</p>
        <Link href="/catalogo" className="text-ouro hover:underline">Ver perfumes →</Link>
      </div>
    );
  }

  // A partir daqui é obrigatório ter sessão: o cliente tem de existir no SAP
  // (Business Partner) e no Moloni para a fatura ser emitida em nome dele.
  if (!user) {
    return (
      <div className="flex max-w-[560px] flex-col items-start gap-5 border border-loja-line bg-loja-surface p-8">
        <h2 className="font-serif text-2xl">Inicie sessão para continuar</h2>
        <p className="leading-relaxed text-loja-muted">
          Para emitirmos a fatura em seu nome precisamos da sua conta. O seu carrinho fica guardado
          ({count} {count === 1 ? "artigo" : "artigos"}) e continua aqui depois de iniciar sessão.
        </p>
        {/* TODO(Auth0): ligar ao login do Auth0 com regresso a /checkout */}
        <button type="button" disabled className="h-13 bg-ouro px-8 font-semibold text-loja-bg opacity-50">
          Iniciar sessão
        </button>
        <span className="text-xs text-loja-muted">O início de sessão (Auth0) ainda não está ativo.</span>
        <Link href="/carrinho" className="text-sm text-ouro hover:underline">← Voltar ao carrinho</Link>
      </div>
    );
  }

  // TODO: com sessão — dados de faturação, validar stock no SAP, fatura-recibo no Moloni
  return <p className="text-loja-muted">Checkout em construção.</p>;
}
