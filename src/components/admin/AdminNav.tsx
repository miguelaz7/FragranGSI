import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { AdminNavLink } from "./AdminNavLink";

// Secções do backoffice. As que ainda não existem aparecem desativadas.
const items = [
  { href: "/admin", label: "Dashboard", ready: true },
  { href: "/admin/analista", label: "Analista IA", ready: true },
  { href: "/admin/produtos", label: "Produtos", ready: true },
  { href: "/admin/encomendas", label: "Encomendas", ready: false },
  { href: "/admin/clientes", label: "Clientes", ready: true },
  { href: "/admin/faturas", label: "Faturas", ready: false },
  { href: "/admin/devolucoes", label: "Devoluções", ready: false },
  { href: "/admin/integracao", label: "Integração", ready: true },
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
          // O AdminNavLink lê o URL atual; enquanto não o sabe (ex.: rotas com
          // parâmetros), mostra o link simples, sem realce
          <Suspense
            key={item.href}
            fallback={<Link href={item.href} className={`${itemClass} text-[#CFC7BA]`}>{item.label}</Link>}
          >
            <AdminNavLink href={item.href}>
              {item.label}
              {/* Nº de erros por resolver ao lado de "Integração" */}
              {item.href === "/admin/integracao" && (
                <Suspense>
                  <ErrorBadge />
                </Suspense>
              )}
            </AdminNavLink>
          </Suspense>
        ) : (
          <span key={item.href} aria-disabled className={`${itemClass} cursor-default text-[#6E665B]`} title="Em breve">
            {item.label}
          </span>
        ),
      )}

      <Link href="/" className={`${itemClass} mt-6 text-[13px] text-loja-muted hover:text-loja-text`}>
        ↗ Ver loja
      </Link>
    </nav>
  );
}
