import { connection } from "next/server";
import { getStoreCatalog } from "@/lib/catalog";

// GET /api/produtos — catálogo da loja (o que o cliente vê): Moloni + ficha local.
export async function GET() {
  await connection(); // dados por pedido: não correr no build
  try {
    return Response.json(await getStoreCatalog());
  } catch (err) {
    return Response.json({ error: `Não foi possível ler o catálogo: ${(err as Error).message}` }, { status: 503 });
  }
}
