import "server-only";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { cookies, headers } from "next/headers";
import type { User } from "@/generated/prisma/client";
import { db } from "@/lib/db";

// Contas da loja: a password fica só em hash (bcrypt) e a sessão é um token aleatório
// num cookie httpOnly. A BD guarda o hash do token, nunca o próprio token.

const SESSION_COOKIE = "sessao";
const SESSION_DAYS = 30;
const BCRYPT_COST = 12;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export const hashPassword = (password: string) => bcrypt.hash(password, BCRYPT_COST);

/** Compara com um hash de referência quando a conta não tem password: assim demora o mesmo. */
const NO_PASSWORD = bcrypt.hashSync("sem-password", BCRYPT_COST);

export async function verifyPassword(password: string, user: User | null) {
  const matches = await bcrypt.compare(password, user?.passwordHash || NO_PASSWORD);
  return !!user?.passwordHash && matches;
}

/** Inicia sessão. Só funciona em Server Actions, que são quem pode alterar cookies. */
export async function createSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.session.create({ data: { id: hashToken(token), userId, expiresAt } });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, // o JavaScript do browser não lhe consegue aceder
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { id: hashToken(token) } });
  store.delete(SESSION_COOKIE);
}

/** Termina as outras sessões do cliente, por exemplo depois de mudar a password. */
export async function destroyOtherSessions(userId: string) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  await db.session.deleteMany({ where: { userId, NOT: token ? { id: hashToken(token) } : undefined } });
}

/** Cliente com sessão iniciada, ou null. */
export async function getCurrentUser(): Promise<User | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({ where: { id: hashToken(token) }, include: { user: true } });
  if (!session || session.expiresAt < new Date()) return null;
  return session.user;
}

// --- Limite de tentativas de login ---
// Trava quem tenta adivinhar uma password. Fica em memória: reinicia com o servidor.
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const failures = new Map<string, number[]>();

async function attemptKey(email: string) {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0].trim() || "local";
  return `${ip}|${email}`;
}

export async function tooManyAttempts(email: string) {
  const key = await attemptKey(email);
  const recent = (failures.get(key) ?? []).filter((t) => Date.now() - t < WINDOW_MS);
  failures.set(key, recent);
  return recent.length >= MAX_ATTEMPTS;
}

export async function recordFailedAttempt(email: string) {
  const key = await attemptKey(email);
  failures.set(key, [...(failures.get(key) ?? []), Date.now()]);
}

export async function clearAttempts(email: string) {
  failures.delete(await attemptKey(email));
}
