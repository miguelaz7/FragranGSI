import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { db } from "@/lib/db";

// Secções do backoffice. As que ainda não existem aparecem desativadas.
const items = [
  { href: "/admin", label: "Dashboard", ready: true },
  { href: "/admin/produtos", label: "Produtos", ready: false },
  { href: "/admin/encomendas", label: "Encomendas", ready: false },
  { href: "/admin/clientes", label: "Clientes", ready: false },
  { href: "/admin/faturas", label: "Faturas", ready: false },
  { href: "/admin/devolucoes", label: "Devoluções", ready: false },
];

const itemClass = "flex h-11 items-center justify-between px-3 text-sm";

// Nº de erros de integração por resolver (lido a cada pedido)
async function ErrorBadge() {
  await connection();
  const errors = await db.integrationLog.count({ where: { status: "Erro" } });
  if (errors === 0) return null;
  return (
    <span
      aria-label={`${errors} erros`}
      className="flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-[#F2B8B5] px-1.5 text-xs font-bold text-[#5C0F0B]"
    >
      {errors}
    </span>
  );
}

export function AdminNav() {
  return (
    <nav
      aria-label="Backoffice"
      className="flex max-w-[260px] flex-[1_1_220px] flex-col gap-1 bg-loja-bg px-4 py-7 text-loja-text"
    >
      <span className="px-3 pb-1 font-serif text-[22px] tracking-[0.02em]">
        fragran<span className="text-ouro">GSI</span>
      </span>
      <span className="px-3 pb-6 text-[11px] uppercase tracking-[0.16em] text-loja-muted">Backoffice</span>

      {items.map((item) =>
        item.ready ? (
          // Por agora só o Dashboard existe; quando houver mais páginas,
          // o item ativo passa a ser calculado com usePathname().
          <Link key={item.href} href={item.href} aria-current="page" className={`${itemClass} bg-[#2A2620] font-semibold`}>
            {item.label}
          </Link>
        ) : (
          <span key={item.href} aria-disabled className={`${itemClass} cursor-default text-[#6E665B]`} title="Em breve">
            {item.label}
          </span>
        ),
      )}
      <span aria-disabled className={`${itemClass} cursor-default text-[#6E665B]`} title="Em breve">
        Integração
        <Suspense>
          <ErrorBadge />
        </Suspense>
      </span>

      <Link href="/" className={`${itemClass} mt-6 text-[13px] text-loja-muted hover:text-loja-text`}>
        ↗ Ver loja
      </Link>
    </nav>
  );
}
