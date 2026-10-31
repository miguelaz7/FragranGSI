import { connection } from "next/server";
import { buildSnapshot } from "@/lib/analytics";
import { formatEur } from "@/lib/format";
import { AskButton } from "./AnalystChat";

// Painel "O que o analista está a ver": os mesmos números que são enviados ao
// Gemini (buildSnapshot), para quem decide poder confirmar as respostas.

const TOPICS = [
  { title: "Vendas", questions: ["Como está a correr esta semana face à anterior?", "Qual é o melhor dia da semana para vender?"] },
  { title: "Perfumes", questions: ["Qual foi o perfume mais vendido nos últimos 7 dias?", "Que perfumes estão a perder vendas?"] },
  { title: "Stock e carrinhos", questions: ["Que perfumes devo repor ou destacar?", "Há carrinhos abandonados com valor relevante?"] },
  { title: "Integração", questions: ["Houve problemas com o SAP, o Moloni ou a IA esta semana?"] },
];

function Fact({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: "up" | "down" }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-admin-line py-2.5 last:border-0">
      <span className="text-xs text-admin-muted">{label}</span>
      <span className="text-sm font-semibold">{value}</span>
      {note && <span className={`text-xs ${tone === "up" ? "text-sucesso" : tone === "down" ? "text-erro" : "text-admin-muted"}`}>{note}</span>}
    </div>
  );
}

export async function AnalystInsights() {
  await connection();
  const s = await buildSnapshot();
  const week = s.resumo.ultimos7dias;
  const prev = s.resumo.semanaAnterior;
  const change = prev.receita ? Math.round(((week.receita - prev.receita) / prev.receita) * 100) : null;

  const top = s.porPerfume[0];
  const movers = s.porPerfume.filter((p) => p.variacaoUnidadesPct !== null && p.unidades7d + p.unidades7dAnteriores >= 3);
  const riser = [...movers].sort((a, b) => b.variacaoUnidadesPct! - a.variacaoUnidadesPct!)[0];
  const faller = [...movers].sort((a, b) => a.variacaoUnidadesPct! - b.variacaoUnidadesPct!)[0];
  const openErrors = s.integracao.reduce((n, i) => n + i.porResolver, 0);

  return (
    <div className="flex flex-col gap-4">
      <section className="border border-admin-line bg-admin-card p-4">
        <h2 className="mb-1 text-sm font-semibold">O que o analista está a ver</h2>
        {week.encomendas === 0 && prev.encomendas === 0 ? (
          <p className="py-2 text-[13px] text-admin-muted">Ainda não há encomendas nos últimos 14 dias.</p>
        ) : (
          <>
            <Fact
              label="Receita (7 dias)"
              value={formatEur(week.receita)}
              note={change === null ? undefined : `${change >= 0 ? "▲" : "▼"} ${Math.abs(change)}% vs. semana anterior`}
              tone={change === null ? undefined : change >= 0 ? "up" : "down"}
            />
            <Fact label="Encomendas (7 dias)" value={`${week.encomendas} · ticket médio ${formatEur(week.ticketMedio)}`} />
            {top && top.unidades7d > 0 && <Fact label="Mais vendido (7 dias)" value={top.nome} note={`${top.unidades7d} un. · ${formatEur(top.receita7d)}`} />}
            {riser && riser.variacaoUnidadesPct! > 0 && (
              <Fact label="A subir" value={riser.nome} note={`▲ ${riser.variacaoUnidadesPct}% (${riser.unidades7dAnteriores} → ${riser.unidades7d} un.)`} tone="up" />
            )}
            {faller && faller.variacaoUnidadesPct! < 0 && (
              <Fact label="A descer" value={faller.nome} note={`▼ ${Math.abs(faller.variacaoUnidadesPct!)}% (${faller.unidades7dAnteriores} → ${faller.unidades7d} un.)`} tone="down" />
            )}
          </>
        )}
        <Fact label="Erros de integração por resolver" value={String(openErrors)} tone={openErrors ? "down" : undefined} />
        {s.avisoDados && <p className="mt-2 text-xs text-[#9A5B00]">Inclui dados de demonstração.</p>}
      </section>

      <section className="flex flex-col gap-3 border border-admin-line bg-admin-card p-4">
        <h2 className="text-sm font-semibold">Perguntas sugeridas</h2>
        {TOPICS.map((t) => (
          <div key={t.title} className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold tracking-wide text-admin-muted uppercase">{t.title}</span>
            {t.questions.map((q) => <AskButton key={q} question={q} />)}
          </div>
        ))}
      </section>
    </div>
  );
}
