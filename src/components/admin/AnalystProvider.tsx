"use client";

import { createContext, use, useEffect, useState } from "react";

// Estado do Analista IA partilhado por todo o backoffice: o separador flutuante
// (AnalystWidget) e a página /admin/analista mostram as mesmas conversas.
// As conversas ficam guardadas no browser (localStorage) de quem as usa.

export type Message = { role: "user" | "model"; text: string };
export type Conversation = { id: string; title: string; messages: Message[]; updatedAt: number };

type AnalystState = {
  conversations: Conversation[];
  active: Conversation | null;
  open: boolean;
  loading: boolean;
  error: string | null;
  setOpen: (open: boolean) => void;
  ask: (question: string) => Promise<void>;
  newConversation: () => void;
  selectConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
};

const STORAGE_KEY = "fragrangsi.analista";
const MAX_CONVERSATIONS = 20;

// Valor por defeito (sem conversas, ações vazias): usado só se um componente
// for desenhado fora do provider, ex.: quando o Next valida a página isoladamente
const EMPTY: AnalystState = {
  conversations: [],
  active: null,
  open: false,
  loading: false,
  error: null,
  setOpen: () => {},
  ask: async () => {},
  newConversation: () => {},
  selectConversation: () => {},
  deleteConversation: () => {},
};

const AnalystContext = createContext<AnalystState>(EMPTY);

export function useAnalyst() {
  return use(AnalystContext);
}

type Saved = { conversations: Conversation[]; activeId: string | null; open: boolean };

function load(): Saved {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // Sem acesso ao localStorage (ex.: janela privada): começa vazio
  }
  return { conversations: [], activeId: null, open: false };
}

export function AnalystProvider({ children }: { children: React.ReactNode }) {
  const [saved, setSaved] = useState<Saved>({ conversations: [], activeId: null, open: false });
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lê as conversas guardadas depois de a página abrir no browser
  // (no servidor não há localStorage)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincronizar com o localStorage
    setSaved(load());
    setLoaded(true);
  }, []);

  // Grava sempre que algo muda
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    } catch {}
  }, [saved, loaded]);

  const { conversations, activeId, open } = saved;
  const active = conversations.find((c) => c.id === activeId) ?? null;

  function update(fn: (s: Saved) => Saved) {
    setSaved((s) => fn(s));
  }

  async function ask(question: string) {
    const q = question.trim();
    if (!q || loading) return;

    // Conversa atual, ou uma nova com o título da primeira pergunta
    const conv: Conversation = active ?? { id: crypto.randomUUID(), title: q.slice(0, 60), messages: [], updatedAt: Date.now() };
    const messages: Message[] = [...conv.messages, { role: "user", text: q }];
    const put = (msgs: Message[]) =>
      update((s) => ({
        ...s,
        activeId: conv.id,
        conversations: [{ ...conv, messages: msgs, updatedAt: Date.now() }, ...s.conversations.filter((c) => c.id !== conv.id)].slice(0, MAX_CONVERSATIONS),
      }));

    put(messages);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/analista", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "O analista não respondeu.");
      put([...messages, { role: "model", text: data.answer }]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const value: AnalystState = {
    conversations,
    active,
    open,
    loading,
    error,
    ask,
    setOpen: (o) => update((s) => ({ ...s, open: o })),
    newConversation: () => {
      setError(null);
      update((s) => ({ ...s, activeId: null }));
    },
    selectConversation: (id) => {
      setError(null);
      update((s) => ({ ...s, activeId: id }));
    },
    deleteConversation: (id) =>
      update((s) => ({ ...s, activeId: s.activeId === id ? null : s.activeId, conversations: s.conversations.filter((c) => c.id !== id) })),
  };

  return <AnalystContext value={value}>{children}</AnalystContext>;
}
