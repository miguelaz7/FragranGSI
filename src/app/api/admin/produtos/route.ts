import { connection } from "next/server";
import { getCatalog } from "@/lib/catalog";

// GET /api/admin/produtos — catálogo do backoffice: SAP (material, PR00, stock de entradas)
// + Moloni (preço e stock vendável) + ficha local.
// TODO(admin): só para admin (o /admin ainda está aberto, ver CLAUDE.md).
export async function GET() {
  await connection();
  try {
    return Response.json(await getCatalog());
  } catch (err) {
    return Response.json({ error: `Não foi possível ler o catálogo: ${(err as Error).message}` }, { status: 503 });
  }
}
