"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAnalyst } from "./AnalystProvider";
import { AnalystChat, ConversationBar } from "./AnalystChat";

// Separador flutuante do Analista IA, presente em todas as páginas do backoffice.
// Minimizado = só o separador; aberto = painel com a conversa. Na página
// /admin/analista não aparece (lá a conversa já ocupa o ecrã).
export function AnalystWidget() {
  const pathname = usePathname();
  const { open, setOpen, active, loading } = useAnalyst();
  if (pathname.startsWith("/admin/analista")) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed right-6 bottom-0 z-40 flex h-11 items-center gap-2 border border-b-0 border-admin-text bg-admin-text px-5 text-sm font-semibold text-white shadow-lg hover:bg-black"
      >
        ✦ Analista IA
        {active && <span className="max-w-[180px] truncate font-normal text-white/70">· {active.title}</span>}
        {loading && <span className="font-normal text-white/70">· a responder…</span>}
      </button>
    );
  }

  return (
    <section
      aria-label="Analista IA"
      className="fixed right-6 bottom-0 z-40 flex h-[min(620px,calc(100vh-2rem))] w-[min(440px,calc(100vw-2rem))] flex-col border border-b-0 border-admin-line bg-admin-card shadow-2xl"
    >
      <header className="flex items-center justify-between gap-2 bg-admin-text px-4 py-2.5 text-white">
        <span className="text-sm font-semibold">✦ Analista IA</span>
        <div className="flex items-center gap-1">
          <Link href="/admin/analista" title="Abrir em ecrã inteiro" className="flex h-8 items-center px-2 text-[13px] hover:underline">
            Ecrã inteiro ↗
          </Link>
          <button type="button" onClick={() => setOpen(false)} title="Minimizar" aria-label="Minimizar" className="flex size-8 items-center justify-center text-lg hover:bg-white/10">
            –
          </button>
        </div>
      </header>
      <div className="border-b border-admin-line px-4 py-2.5">
        <ConversationBar compact />
      </div>
      <AnalystChat compact />
    </section>
  );
}
