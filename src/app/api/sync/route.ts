import { createHash, timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { runFullSync, syncInProgress } from "@/lib/sync";

// POST /api/sync — sincronização automática SAP ↔ Moloni, chamada pelo n8n de X em X
// minutos (workflow em n8n/sincronizacao-sap-moloni.json). Faz o mesmo que o botão
// «Sincronizar com o SAP»: artigos, preços e entradas de stock do SAP para o Moloni,
// preços alterados no Moloni para o SAP e clientes ativados no Fiori.
// Protegida por um token no cabeçalho: Authorization: Bearer <SYNC_TOKEN do .env>.

/** Compara em tempo constante, para o tempo de resposta não revelar o token. */
function validToken(header: string | null) {
  const expected = process.env.SYNC_TOKEN;
  const received = header?.match(/^Bearer (.+)$/)?.[1];
  if (!expected || !received) return false;
  const hash = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(hash(received), hash(expected));
}

export async function POST(req: Request) {
  if (!process.env.SYNC_TOKEN) {
    return Response.json({ error: "Sincronização automática desligada: falta SYNC_TOKEN no .env." }, { status: 503 });
  }
  if (!validToken(req.headers.get("authorization"))) {
    return Response.json({ error: "Token inválido." }, { status: 401 });
  }
  // Se o botão ou a execução anterior ainda estiverem a correr, esta é saltada.
  // Responde 200: não é um erro, e o n8n não deve marcar a execução como falhada.
  if (syncInProgress()) {
    return Response.json({ ok: true, saltada: true, motivo: "Já havia uma sincronização a correr." });
  }

  try {
    const result = await runFullSync((tag) => revalidateTag(tag, { expire: 0 }));
    // 200 mesmo com erros parciais: cada erro fica no monitor com «Tentar novamente»
    return Response.json({ ok: result.erros === 0, ...result });
  } catch (err) {
    // Só chega aqui se nem o catálogo do SAP se conseguiu ler
    return Response.json({ ok: false, error: `A sincronização falhou: ${(err as Error).message}` }, { status: 502 });
  }
}
