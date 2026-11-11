import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// BD partilhada pelo grupo: PostgreSQL no Supabase (DATABASE_URL no .env).
// Antes era um SQLite local, mas cada PC tinha a sua BD (fichas, contas e
// encomendas diferentes) enquanto o SAP e o Moloni são um só.

// Em desenvolvimento o Next recarrega os módulos a cada alteração;
// guardamos o cliente no globalThis para não abrir ligações novas sempre.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Falta DATABASE_URL no .env (ligação ao PostgreSQL do Supabase).");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
