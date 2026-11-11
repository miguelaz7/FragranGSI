import { connection } from "next/server";
import { db } from "@/lib/db";

// GET /api/admin/encomendas/{id} — uma encomenda (ex.: /api/admin/encomendas/1048).
// TODO(admin): só para admin (o /admin ainda está aberto, ver CLAUDE.md).
export async function GET(_req: Request, ctx: RouteContext<"/api/admin/encomendas/[id]">) {
  await connection();
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "Número de encomenda inválido." }, { status: 400 });

  const order = await db.order.findUnique({
    where: { id },
    include: { items: true, user: { select: { id: true, name: true, email: true } } },
  });
  if (!order) return Response.json({ error: "Encomenda não encontrada." }, { status: 404 });
  return Response.json(order);
}
