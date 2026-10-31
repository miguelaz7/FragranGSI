import { readFile } from "node:fs/promises";
import path from "node:path";
import { PHOTO_DIR, PHOTO_TYPES, SAFE_NAME } from "@/lib/photos";

// Serve as fotos de produto gravadas pelo backoffice (uploads/produtos/).
export async function GET(_req: Request, ctx: RouteContext<"/fotos/[nome]">) {
  const { nome } = await ctx.params;
  if (!SAFE_NAME.test(nome)) return new Response("Não encontrado", { status: 404 });

  try {
    const data = await readFile(path.join(PHOTO_DIR, nome));
    const ext = nome.split(".").pop();
    const type = Object.keys(PHOTO_TYPES).find((t) => PHOTO_TYPES[t] === ext)!;
    return new Response(data, {
      headers: {
        "Content-Type": type,
        // O nome muda a cada upload, por isso o ficheiro nunca muda: pode ficar em cache
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Não encontrado", { status: 404 });
  }
}
