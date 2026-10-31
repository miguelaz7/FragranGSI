import "server-only";
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

// Fotos dos produtos enviadas pelo backoffice. Ficam em uploads/produtos/
// (fora do git) e são servidas pela rota /fotos/[nome].

export const PHOTO_DIR = path.join(process.cwd(), "uploads", "produtos");
export const MAX_PHOTO_BYTES = 4 * 1024 * 1024; // 4 MB

export const PHOTO_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

// Só letras, números, hífen e ponto: impede nomes como "../../.env"
export const SAFE_NAME = /^[A-Za-z0-9-]+\.(jpg|png|webp)$/;

/** Valida e grava a foto; devolve o URL público, ex.: "/fotos/PERF001-093-1730000000.jpg". */
export async function savePhoto(file: File, sapProduct: string) {
  const ext = PHOTO_TYPES[file.type];
  if (!ext) throw new Error("A foto tem de ser JPG, PNG ou WebP.");
  if (file.size > MAX_PHOTO_BYTES) throw new Error("A foto não pode ter mais de 4 MB.");

  // Nome novo a cada upload, para o browser não mostrar a foto antiga em cache
  const name = `${sapProduct.replace(/[^A-Za-z0-9-]/g, "")}-${Date.now()}.${ext}`;
  await mkdir(PHOTO_DIR, { recursive: true });
  await writeFile(path.join(PHOTO_DIR, name), Buffer.from(await file.arrayBuffer()));
  return `/fotos/${name}`;
}

/**
 * Foto já existente com o nome do código (ex.: uploads/produtos/PERF002-093.png,
 * as fotos do design). Usada quando se guarda uma ficha sem enviar foto.
 */
export async function findPhotoFor(sapProduct: string) {
  for (const ext of Object.values(PHOTO_TYPES)) {
    const name = `${sapProduct}.${ext}`;
    if (!SAFE_NAME.test(name)) return null;
    try {
      await access(path.join(PHOTO_DIR, name));
      return `/fotos/${name}`;
    } catch {}
  }
  return null;
}
