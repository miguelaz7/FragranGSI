import { connection } from "next/server";
import { db } from "@/lib/db";

// GET /api/admin/encomendas — encomendas com linhas e cliente.
// Filtros: ?status=Pendente|Enviada|Entregue  ?demo=false  ?limit=50
// TODO(admin): só para admin (o /admin ainda está aberto, ver CLAUDE.md).
export async function GET(req: Request) {
  await connection();
  const params = new URL(req.url).searchParams;
  const status = params.get("status");
  const demo = params.get("demo");
  const limit = Math.min(Math.max(Number(params.get("limit")) || 50, 1), 500);

  const orders = await db.order.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(demo === "false" ? { isDemo: false } : demo === "true" ? { isDemo: true } : {}),
    },
    include: { items: true, user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return Response.json(orders);
}
