// Dados iniciais: enriquecimento dos perfumes que já existem no SAP.
// Correr com: npx prisma db seed
//
// O nome, o preço e o stock NÃO estão aqui: vêm do SAP. Cada entrada tem de
// usar o nº de material real do SAP (ver CLAUDE.md, "Perfumes no SAP").
import "dotenv/config";
import { db } from "../src/lib/db";

const products = [
  {
    sapProduct: "PERF001-093", family: "Oriental amadeirado", gender: "unissexo",
    concentration: "Eau de Parfum", sizeMl: 100, featured: true,
    topNotes: "Bergamota, pimenta rosa", heartNotes: "Âmbar, ládano", baseNotes: "Cedro, baunilha, benjoim",
    description: "Quente e envolvente, pensado para noites frias.",
  },
];

async function main() {
  for (const p of products) {
    await db.productInfo.upsert({ where: { sapProduct: p.sapProduct }, update: p, create: p });
  }
  console.log(`${products.length} produto(s) enriquecido(s).`);
}

main().finally(() => db.$disconnect());
