"use client";

import Link from "next/link";
import { useState } from "react";
import { formatEur } from "@/lib/format";
import { MAX_TEXT, QUESTIONS, type Answers, type RecommendResult } from "@/lib/assistant-options";
import { ProductImage } from "./ProductImage";

// Perguntas + resultados do assistente. Envia as respostas para a API Route
// /api/recomendar, que escolhe os perfumes no servidor.
export function AssistantForm() {
  const [answers, setAnswers] = useState<Answers>({});
  const [result, setResult] = useState<RecommendResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/recomendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(answers),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Não foi possível obter sugestões.");
      setResult(data);
    } catch (err) {
      setError((err as Error).message);
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  const summary = [answers.ocasiao, answers.notas, answers.intensidade].filter(Boolean).join(" · ");

  return (
    <>
      <form onSubmit={submit} className="flex flex-col gap-8">
        {QUESTIONS.map((q) => (
          <fieldset key={q.key} className="flex flex-col gap-3">
            <legend className="mb-3 font-serif text-2xl">{q.title}</legend>
            <div className="flex flex-wrap gap-2">
              {q.options.map((label) => {
                const on = answers[q.key] === label;
                return (
                  <button
                    key={label}
                    type="button"
                    aria-pressed={on}
                    // Clicar outra vez na opção escolhida desmarca-a
                    onClick={() => setAnswers((a) => ({ ...a, [q.key]: on ? undefined : label }))}
                    className={`h-11 rounded-full border px-5 text-sm ${on ? "border-ouro bg-ouro font-semibold text-loja-bg" : "border-[#4A443B] hover:border-ouro"}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}

        <label className="flex flex-col gap-2 text-sm text-loja-muted">
          Ou descreva o que procura
          <textarea
            rows={3}
            maxLength={MAX_TEXT}
            value={answers.texto ?? ""}
            onChange={(e) => setAnswers((a) => ({ ...a, texto: e.target.value }))}
            placeholder="Ex.: algo fresco para o verão, para oferecer ao meu pai"
            className="border border-loja-line bg-loja-surface p-3 text-base text-loja-text placeholder:text-loja-muted focus:border-ouro focus:outline-none"
          />
        </label>

        <button type="submit" disabled={loading} className="h-13 self-start bg-ouro px-8 text-[15px] font-semibold text-loja-bg hover:bg-ouro/90 disabled:opacity-60">
          {loading ? "A procurar…" : "Ver sugestões"}
        </button>
        {error && <p role="alert" className="text-sm text-[#F2B8B5]">{error}</p>}
      </form>

      {result && (
        <section aria-labelledby="sugestoes" aria-live="polite" className="flex flex-col gap-6 border-t border-loja-line pt-10">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="sugestoes" className="font-serif text-4xl">Sugestões para si</h2>
            {summary && <span className="text-sm text-loja-muted">{summary}</span>}
          </div>
          {result.recs.length === 0 ? (
            <p className="text-loja-muted">
              Nenhum dos perfumes em stock corresponde bem ao que procura.{" "}
              <Link href="/catalogo" className="text-ouro hover:underline">Ver todos os perfumes →</Link>
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              {result.recs.map((r) => (
                <Link
                  key={r.sapProduct}
                  href={`/produto/${encodeURIComponent(r.sapProduct)}`}
                  className="group flex gap-5 border border-loja-line p-4 hover:border-ouro"
                >
                  <div className="w-24 shrink-0">
                    <ProductImage src={r.imageUrl} />
                  </div>
                  <div className="flex flex-1 flex-col gap-2">
                    <div className="flex flex-wrap items-baseline justify-between gap-3">
                      <span className="font-serif text-2xl group-hover:text-ouro">{r.name}</span>
                      <span className="font-semibold">{formatEur(r.price)}</span>
                    </div>
                    <span className="text-xs uppercase tracking-[0.18em] text-ouro">{r.match}</span>
                    <span className="leading-relaxed text-loja-muted">{r.why}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
          <span className="text-xs text-loja-muted">
            {result.source === "ia"
              ? "Sugestões geradas com IA a partir das notas olfativas do catálogo, só entre perfumes em stock."
              : "Sugestões calculadas a partir das notas olfativas do catálogo, só entre perfumes em stock."}
          </span>
        </section>
      )}
    </>
  );
}
