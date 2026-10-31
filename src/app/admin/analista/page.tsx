import type { Metadata } from "next";
import { Suspense } from "react";
import { AnalystChat, ConversationList } from "@/components/admin/AnalystChat";
import { AnalystInsights } from "@/components/admin/AnalystInsights";
import { DemoDataNotice } from "@/components/admin/DemoDataNotice";

export const metadata: Metadata = { title: "Analista IA" };

// Página de trabalho do analista em três colunas: conversas | conversa | factos e sugestões.
// Em ecrãs estreitos as colunas empilham-se.
export default function AnalistaPage() {
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-[28px] font-bold">Analista IA</h1>
        <span className="max-w-[760px] text-sm text-admin-muted">
          Pergunte em linguagem normal. As respostas usam um resumo dos dados atuais da loja (vendas, perfumes, clientes,
          carrinhos, stock do SAP e integrações), sem dados pessoais dos clientes.
        </span>
      </div>
      <Suspense>
        <DemoDataNotice offerCreate />
      </Suspense>

      <div className="grid gap-4 lg:h-[calc(100vh-15rem)] lg:min-h-[560px] lg:grid-cols-[240px_minmax(0,1fr)_280px]">
        <ConversationList />
        <div className="flex h-[70vh] min-h-0 flex-col lg:h-auto">
          <AnalystChat />
        </div>
        <div className="min-h-0 lg:overflow-y-auto">
          <Suspense fallback={<p className="text-sm text-admin-muted">A carregar dados…</p>}>
            <AnalystInsights />
          </Suspense>
        </div>
      </div>
    </>
  );
}
