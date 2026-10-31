"use client";

import { useEffect, useRef, useState } from "react";
import { useAnalyst } from "./AnalystProvider";

const SUGGESTIONS = [
  "Qual foi o perfume mais vendido nos últimos 7 dias?",
  "Que tendências vês nos últimos dias?",
  "Como está a correr esta semana face à anterior?",
  "Que perfumes devo repor ou destacar?",
];

// Mostra **negrito** e linhas "- " como lista. O texto vem como texto simples
// (sem HTML), por isso não há risco de injetar código na página.
function Formatted({ text }: { text: string }) {
  const inline = (line: string) =>
    line.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : part,
    );
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) blocks.push(<ul key={blocks.length} className="ml-5 list-disc">{list.map((l, i) => <li key={i}>{inline(l)}</li>)}</ul>);
    list = [];
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (/^[-*•] /.test(line)) list.push(line.slice(2));
    else {
      flush();
      if (line) blocks.push(<p key={blocks.length}>{inline(line)}</p>);
    }
  }
  flush();
  return <div className="flex flex-col gap-2">{blocks}</div>;
}

// Conversa com o Analista IA (estado partilhado em AnalystProvider).
// compact = separador flutuante; sem compact = cartão da página /admin/analista.
// Em ambos, as mensagens deslizam dentro da caixa e a pergunta fica sempre visível.
export function AnalystChat({ compact = false }: { compact?: boolean }) {
  const { active, loading, error, ask } = useAnalyst();
  const [input, setInput] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const messages = active?.messages ?? [];

  // Desce até à última mensagem dentro da caixa (sem mexer no resto da página)
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, loading]);

  function send(q: string) {
    if (!q.trim() || loading) return;
    setInput("");
    ask(q);
  }

  return (
    <div className={`flex min-h-0 flex-1 flex-col ${compact ? "" : "border border-admin-line bg-admin-card"}`}>
      {!compact && (
        <div className="flex items-center justify-between gap-3 border-b border-admin-line px-5 py-3">
          <span className="truncate text-sm font-semibold">{active?.title ?? "Nova conversa"}</span>
          {active && <span className="shrink-0 text-xs text-admin-muted">{Math.ceil(messages.length / 2)} pergunta(s)</span>}
        </div>
      )}

      <div ref={listRef} className={`flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto ${compact ? "p-4" : "p-5"}`} aria-live="polite">
        {messages.length === 0 && (
          <div className="m-auto flex max-w-[420px] flex-col items-center gap-3 text-center">
            <span aria-hidden className="flex size-12 items-center justify-center rounded-full bg-[#FBF6EA] text-xl text-[#8A6A2F]">✦</span>
            <span className="text-base font-semibold">O que quer saber sobre a loja?</span>
            <span className="text-sm text-admin-muted">Vendas, perfumes, clientes, carrinhos, stock ou integrações: pergunte em linguagem normal.</span>
            {compact && (
              <div className="mt-2 flex flex-col gap-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" onClick={() => send(s)} className="rounded-full border border-[#D4D0C8] px-4 py-2 text-sm hover:border-admin-text">
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="max-w-[80%] self-end rounded-2xl rounded-br-sm bg-admin-text px-4 py-2.5 text-sm text-white">{m.text}</div>
          ) : (
            <div key={i} className="flex max-w-[92%] gap-3 self-start">
              <span aria-hidden className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-full bg-[#FBF6EA] text-sm text-[#8A6A2F]">✦</span>
              <div className="rounded-2xl rounded-tl-sm border border-admin-line bg-admin-bg px-4 py-3 text-sm leading-relaxed">
                <Formatted text={m.text} />
              </div>
            </div>
          ),
        )}
        {loading && (
          <div className="flex items-center gap-3 self-start text-sm text-admin-muted">
            <span aria-hidden className="flex size-7 animate-pulse items-center justify-center rounded-full bg-[#FBF6EA] text-[#8A6A2F]">✦</span>
            A analisar os dados da loja…
          </div>
        )}
        {error && <p role="alert" className="text-sm text-erro">{error}</p>}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className={`flex gap-2 border-t border-admin-line ${compact ? "p-3" : "p-4"}`}
      >
        <label htmlFor={compact ? "pergunta-flutuante" : "pergunta"} className="sr-only">Pergunta ao analista</label>
        <input
          id={compact ? "pergunta-flutuante" : "pergunta"}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={1000}
          placeholder="Escreva a sua pergunta…"
          className="h-11 min-w-0 flex-1 rounded-full border border-[#D4D0C8] bg-admin-card px-4 text-sm focus:border-admin-text focus:outline-none"
        />
        <button type="submit" disabled={loading || !input.trim()} className="h-11 rounded-full bg-admin-text px-5 text-sm font-semibold text-white hover:bg-black disabled:opacity-50">
          Perguntar
        </button>
      </form>
    </div>
  );
}

/** Botão de pergunta sugerida (usado no painel lateral da página do analista). */
export function AskButton({ question }: { question: string }) {
  const { ask, loading } = useAnalyst();
  return (
    <button
      type="button"
      disabled={loading}
      onClick={() => ask(question)}
      className="w-full border border-admin-line px-3 py-2 text-left text-[13px] hover:border-admin-text disabled:opacity-50"
    >
      {question}
    </button>
  );
}

/** Lista de conversas da página do analista (coluna da esquerda). */
export function ConversationList() {
  const { conversations, active, newConversation, selectConversation, deleteConversation } = useAnalyst();
  // Hora atual para o "há X min": só é lida no browser, depois de a página
  // abrir (na pré-geração do Next não pode haver Date.now()), e a cada minuto
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);
  const ago = (t: number) => {
    if (now === null) return "";
    const min = Math.round((now - t) / 60000);
    return min < 1 ? "agora" : min < 60 ? `há ${min} min` : min < 1440 ? `há ${Math.round(min / 60)} h` : `há ${Math.round(min / 1440)} d`;
  };
  return (
    <nav aria-label="Conversas" className="flex min-h-0 flex-col border border-admin-line bg-admin-card">
      <div className="flex items-center justify-between gap-2 border-b border-admin-line px-4 py-3">
        <span className="text-sm font-semibold">Conversas</span>
        <button type="button" onClick={newConversation} className="h-8 bg-admin-text px-3 text-[13px] font-semibold text-white hover:bg-black">
          + Nova
        </button>
      </div>
      <ul className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {conversations.length === 0 && <li className="p-4 text-[13px] text-admin-muted">As conversas aparecem aqui.</li>}
        {conversations.map((c) => {
          const on = c.id === active?.id;
          return (
            <li key={c.id} className={`group flex items-start gap-1 border-b border-admin-line ${on ? "bg-[#F3EEE3]" : "hover:bg-admin-bg"}`}>
              <button type="button" onClick={() => selectConversation(c.id)} aria-current={on ? "true" : undefined} className="flex min-w-0 flex-1 flex-col gap-0.5 px-4 py-3 text-left">
                <span className="truncate text-[13px] font-semibold">{c.title}</span>
                <span className="text-xs text-admin-muted">{[ago(c.updatedAt), `${Math.ceil(c.messages.length / 2)} pergunta(s)`].filter(Boolean).join(" · ")}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Apagar a conversa "${c.title}"?`)) deleteConversation(c.id);
                }}
                aria-label={`Apagar a conversa ${c.title}`}
                title="Apagar"
                className="mt-2 mr-2 flex size-7 shrink-0 items-center justify-center text-admin-muted opacity-60 hover:text-erro hover:opacity-100 group-hover:opacity-100"
              >
                ✕
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Lista de conversas: escolher, nova e apagar. */
export function ConversationBar({ compact = false }: { compact?: boolean }) {
  const { conversations, active, newConversation, selectConversation, deleteConversation } = useAnalyst();
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <label htmlFor={compact ? "conversa-flutuante" : "conversa"} className="sr-only">Conversa</label>
      <select
        id={compact ? "conversa-flutuante" : "conversa"}
        value={active?.id ?? ""}
        onChange={(e) => (e.target.value ? selectConversation(e.target.value) : newConversation())}
        className="h-9 min-w-0 flex-1 border border-[#D4D0C8] bg-admin-card px-2 text-sm"
      >
        <option value="">Nova conversa</option>
        {conversations.map((c) => (
          <option key={c.id} value={c.id}>{c.title}</option>
        ))}
      </select>
      <button type="button" onClick={newConversation} title="Nova conversa" aria-label="Nova conversa" className="flex size-9 shrink-0 items-center justify-center border border-[#D4D0C8] text-lg hover:border-admin-text">
        +
      </button>
      {active && (
        <button
          type="button"
          onClick={() => {
            if (confirm(`Apagar a conversa "${active.title}"?`)) deleteConversation(active.id);
          }}
          title="Apagar conversa"
          className="h-9 shrink-0 border border-[#D4D0C8] px-3 text-[13px] text-erro hover:border-erro"
        >
          Apagar
        </button>
      )}
    </div>
  );
}
