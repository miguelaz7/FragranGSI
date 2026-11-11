import { connection } from "next/server";
import { db } from "@/lib/db";
import { customerSelect, toCustomerJson } from "./select";

// GET /api/admin/clientes — clientes da BD local com o mapeamento SAP <-> Moloni.
// ?demo=false esconde os clientes de demonstração.
// TODO(admin): só para admin (o /admin ainda está aberto, ver CLAUDE.md).
export async function GET(req: Request) {
  await connection();
  const demo = new URL(req.url).searchParams.get("demo");
  const users = await db.user.findMany({
    where: demo === "false" ? { isDemo: false } : demo === "true" ? { isDemo: true } : undefined,
    select: customerSelect,
    orderBy: { createdAt: "desc" },
  });
  return Response.json(users.map(toCustomerJson));
}
