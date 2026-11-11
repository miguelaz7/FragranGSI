import { connection } from "next/server";
import { getStoreCatalog } from "@/lib/catalog";

// GET /api/produtos/PERF001-093 — um perfume da loja.
export async function GET(_req: Request, ctx: RouteContext<"/api/produtos/[codigo]">) {
  await connection();
  const { codigo } = await ctx.params;
  try {
    const product = (await getStoreCatalog()).find((p) => p.sapProduct === codigo);
    if (!product) return Response.json({ error: "Perfume não encontrado." }, { status: 404 });
    return Response.json(product);
  } catch (err) {
    return Response.json({ error: `Não foi possível ler o catálogo: ${(err as Error).message}` }, { status: 503 });
  }
}
