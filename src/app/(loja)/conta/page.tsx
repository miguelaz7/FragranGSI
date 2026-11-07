import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LoginForm, PasswordForm, ProfileForm, RegisterForm } from "@/components/loja/AccountForms";
import type { User } from "@/generated/prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatEur } from "@/lib/format";
import { logout } from "./actions";

export const metadata: Metadata = { title: "A minha conta" };

const card = "flex flex-col gap-5 border border-loja-line bg-loja-surface p-6 sm:p-8";

export default function ContaPage({ searchParams }: PageProps<"/conta">) {
  return (
    <Suspense fallback={<p className="py-10 text-loja-muted">A carregar…</p>}>
      <Account searchParams={searchParams} />
    </Suspense>
  );
}

async function Account({ searchParams }: Pick<PageProps<"/conta">, "searchParams">) {
  const { modo, voltar, bemvindo } = await searchParams;
  const user = await getCurrentUser();

  if (user) {
    if (voltar === "checkout") redirect("/checkout");
    return <Dashboard user={user} welcome={bemvindo === "1"} />;
  }
  return <SignIn creating={modo === "criar"} voltar={voltar === "checkout" ? "checkout" : ""} />;
}

function SignIn({ creating, voltar }: { creating: boolean; voltar: string }) {
  const query = voltar ? `&voltar=${voltar}` : "";
  const tab = (href: string, active: boolean, label: string) => (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? "page" : undefined}
      className={`-mb-px flex h-13 flex-1 items-center justify-center border-b-2 text-[15px] font-semibold ${active ? "border-ouro" : "border-transparent text-loja-muted hover:text-loja-text"}`}
    >
      {label}
    </Link>
  );

  return (
    <div className="grid items-start gap-10 py-10 lg:grid-cols-2 lg:gap-16 lg:py-14">
      {/* Painel de ambiente, como no mockup. A foto preenche o painel para o fundo dela
          não parecer uma caixa dentro de outra. No telemóvel sai: o formulário vem primeiro */}
      <div className="relative sticky top-10 hidden h-[620px] overflow-hidden border border-loja-line lg:block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/fotos/PERF001-093.webp" alt="" className="absolute inset-0 size-full object-cover object-[center_60%]" />
        <p className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-loja-bg via-loja-bg/90 to-transparent p-10 pt-24 font-serif text-[28px] leading-tight">
          A sua conta guarda encomendas e faturas num só sítio.
        </p>
      </div>

      <section className="mx-auto flex w-full max-w-[460px] flex-col gap-7">
        <div className="flex flex-col gap-2">
          <h1 className="font-serif text-4xl sm:text-[44px]">{creating ? "Criar conta" : "Entrar na conta"}</h1>
          {voltar && <p className="text-loja-muted">O seu carrinho fica guardado. Entre para finalizar a compra.</p>}
        </div>
        <nav aria-label="Entrar ou criar conta" className="flex border-b border-loja-line">
          {tab(`/conta?modo=entrar${query}`, !creating, "Entrar")}
          {tab(`/conta?modo=criar${query}`, creating, "Criar conta")}
        </nav>
        {creating ? <RegisterForm voltar={voltar} /> : <LoginForm voltar={voltar} />}
      </section>
    </div>
  );
}

async function Dashboard({ user, welcome }: { user: User; welcome: boolean }) {
  const orders = await db.order.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 20 });
  const firstName = user.name.split(/\s+/)[0];

  return (
    <div className="flex flex-col gap-8 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-serif text-4xl sm:text-5xl">Olá, {firstName}</h1>
          {welcome && <p role="status" className="text-stock-ok">A sua conta foi criada.</p>}
        </div>
        <form action={logout}>
          <button type="submit" className="h-11 text-sm text-loja-muted underline underline-offset-4 hover:text-ouro">Terminar sessão</button>
        </form>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[1.2fr_1fr]">
        <section className={card}>
          <h2 className="font-serif text-2xl">Os meus dados</h2>
          {/* Só os campos do formulário: o que se passa a um componente "use client" vai para o
              browser, e o objeto user inteiro levava o hash da password */}
          <ProfileForm
            email={user.email}
            profile={{ name: user.name, nif: user.nif, address: user.address, postalCode: user.postalCode, city: user.city }}
          />
        </section>

        <div className="flex flex-col gap-6">
          <section className={card}>
            <h2 className="font-serif text-2xl">As minhas encomendas</h2>
            {orders.length === 0 ? (
              <div className="flex flex-col items-start gap-3">
                <p className="text-sm text-loja-muted">Ainda não tem encomendas.</p>
                <Link href="/catalogo" className="text-sm text-ouro hover:underline">Ver perfumes →</Link>
              </div>
            ) : (
              <ul className="flex flex-col gap-3 text-sm">
                {orders.map((o) => (
                  <li key={o.id} className="flex flex-wrap justify-between gap-2 border-b border-loja-line pb-3 last:border-0">
                    <span>#{o.id} · {o.createdAt.toLocaleDateString("pt-PT")}</span>
                    <span className="text-loja-muted">{o.status}</span>
                    <span>{formatEur(o.total)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <details className={`${card} group`}>
            <summary className="cursor-pointer text-[15px] font-semibold marker:text-ouro">Alterar palavra-passe</summary>
            <div className="mt-5"><PasswordForm /></div>
          </details>
        </div>
      </div>
    </div>
  );
}
