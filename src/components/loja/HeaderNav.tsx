"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { NAV_ITEMS } from "@/lib/nav";

// Navegação principal com a secção atual a dourado (como no mockup).
// Client Component porque precisa do URL atual (caminho + filtro de género).
export function HeaderNav() {
  const pathname = usePathname();
  const genders = useSearchParams().getAll("genero");

  const isActive = (item: (typeof NAV_ITEMS)[number]) => {
    if (item.href === "/assistente") return pathname.startsWith("/assistente");
    const inCatalog = pathname.startsWith("/catalogo") || pathname.startsWith("/produto");
    if (!inCatalog) return false;
    // Só um género filtrado → esse item; outra combinação → "Perfumes"
    const single = pathname.startsWith("/catalogo") && genders.length === 1 ? genders[0] : null;
    return item.gender ? item.gender === single : !single;
  };

  return NAV_ITEMS.map((item) => {
    const active = isActive(item);
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={active ? "text-ouro" : "hover:text-ouro"}
      >
        {item.label}
      </Link>
    );
  });
}
