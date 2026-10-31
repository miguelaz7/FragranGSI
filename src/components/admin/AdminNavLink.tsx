"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Link da barra lateral do backoffice, realçado quando é a página atual.
// É um Client Component só porque precisa de saber o URL atual (usePathname).
export function AdminNavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex h-11 items-center justify-between px-3 text-sm ${active ? "bg-[#2A2620] font-semibold" : "text-[#CFC7BA] hover:text-loja-text"}`}
    >
      {children}
    </Link>
  );
}
