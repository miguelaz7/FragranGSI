import { buildSnapshot } from "@/lib/analytics";
import { geminiChat, geminiConfigured, type ChatMessage } from "@/lib/integration/gemini";

// POST /api/admin/analista — Analista IA do backoffice.
// Recebe a conversa, junta o resumo atual dos dados da loja e pergunta ao Gemini.
// TODO(admin): só para admin (o /admin ainda está aberto, ver CLAUDE.md).

const MAX_MESSAGES = 12; // histórico enviado ao Gemini
const MAX_CHARS = 1000; // por pergunta

const SYSTEM = (data: object) => `És o analista de negócio da loja online de perfumes fragranGSI.
Respondes a quem gere a loja, em português de Portugal, de forma clara e direta.

Regras:
- Baseia-te APENAS nos dados em JSON abaixo. Nunca inventes números, perfumes ou datas.
- Se a pergunta não puder ser respondida com estes dados, diz isso e explica que dados faltam.
- Mostra os números em que te baseias (ex.: "12 unidades nos últimos 7 dias, contra 4 na semana anterior").
- Quando fizer sentido, termina com uma recomendação prática (ex.: repor stock, destacar um perfume).
- Se "avisoDados" estiver preenchido, lembra brevemente que os números incluem dados de demonstração.
- Formato: texto simples; podes usar listas com "- " e **negrito**; não uses tabelas.
- Valores em euros com vírgula decimal (ex.: 1 234,50 €).

Dados da loja (gerados agora):
${JSON.stringify(data)}`;

export async function POST(req: Request) {
  if (!geminiConfigured()) {
    return Response.json({ error: "O Analista IA precisa da GEMINI_API_KEY no .env." }, { status: 503 });
  }

  let messages: ChatMessage[];
  try {
    const body = await req.json();
    messages = (Array.isArray(body.messages) ? body.messages : [])
      .filter((m: ChatMessage) => (m.role === "user" || m.role === "model") && typeof m.text === "string" && m.text.trim())
      .map((m: ChatMessage) => ({ role: m.role, text: m.text.slice(0, MAX_CHARS) }))
      .slice(-MAX_MESSAGES);
  } catch {
    return Response.json({ error: "Pedido inválido." }, { status: 400 });
  }
  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    return Response.json({ error: "Escreva uma pergunta." }, { status: 400 });
  }

  try {
    const answer = await geminiChat({ system: SYSTEM(await buildSnapshot()), messages });
    return Response.json({ answer });
  } catch (err) {
    return Response.json({ error: `O analista não conseguiu responder: ${(err as Error).message}` }, { status: 502 });
  }
}
