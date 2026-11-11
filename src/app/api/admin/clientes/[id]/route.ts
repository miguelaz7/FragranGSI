import { connection } from "next/server";
import { db } from "@/lib/db";
import { customerSelect, toCustomerJson } from "../select";

// GET /api/admin/clientes/{id} — um cliente e as suas encomendas.
// TODO(admin): só para admin (o /admin ainda está aberto, ver CLAUDE.md).
export async function GET(_req: Request, ctx: RouteContext<"/api/admin/clientes/[id]">) {
  await connection();
  const { id } = await ctx.params;
  const user = await db.user.findUnique({
    where: { id },
    select: { ...customerSelect, orders: { include: { items: true }, orderBy: { createdAt: "desc" } } },
  });
  if (!user) return Response.json({ error: "Cliente não encontrado." }, { status: 404 });
  const { orders, ...rest } = user;
  return Response.json({ ...toCustomerJson(rest), orderList: orders });
}
