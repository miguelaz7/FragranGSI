import { recommend } from "@/lib/recommend";
import { MAX_TEXT, QUESTIONS, type Answers } from "@/lib/assistant-options";

// POST /api/recomendar — API Route do assistente (chamada pela página /assistente).
// Corre no servidor: a chave do Gemini nunca chega ao browser.

// Limite simples por IP, para um visitante não gastar a quota da API
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;
const hits = new Map<string, number[]>();

function rateLimited(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > MAX_PER_WINDOW;
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  if (rateLimited(ip)) {
    return Response.json({ error: "Demasiados pedidos. Tente novamente dentro de um minuto." }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Pedido inválido." }, { status: 400 });
  }

  // Só aceita as opções das perguntas e texto curto
  const answers: Answers = {};
  for (const q of QUESTIONS) {
    const v = body[q.key];
    if (typeof v === "string" && (q.options as readonly string[]).includes(v)) answers[q.key] = v;
  }
  if (typeof body.texto === "string" && body.texto.trim()) answers.texto = body.texto.trim().slice(0, MAX_TEXT);

  if (!answers.ocasiao && !answers.notas && !answers.intensidade && !answers.texto) {
    return Response.json({ error: "Responda a pelo menos uma pergunta ou descreva o que procura." }, { status: 400 });
  }

  try {
    return Response.json(await recommend(answers));
  } catch {
    return Response.json({ error: "Não foi possível consultar o catálogo agora. Tente novamente dentro de momentos." }, { status: 503 });
  }
}
