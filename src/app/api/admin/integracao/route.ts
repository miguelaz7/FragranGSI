import { connection } from "next/server";
import { db } from "@/lib/db";

// GET /api/admin/integracao — log das chamadas ao SAP, Moloni e IA.
// Filtros: ?system=SAP|Moloni|IA  ?status=OK|Erro|Resolvido  ?limit=50
// TODO(admin): só para admin (o /admin ainda está aberto, ver CLAUDE.md).
export async function GET(req: Request) {
  await connection();
  const params = new URL(req.url).searchParams;
  const system = params.get("system");
  const status = params.get("status");
  const limit = Math.min(Math.max(Number(params.get("limit")) || 50, 1), 500);

  const logs = await db.integrationLog.findMany({
    where: { ...(system ? { system } : {}), ...(status ? { status } : {}) },
    omit: { retryPayload: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return Response.json(logs);
}
