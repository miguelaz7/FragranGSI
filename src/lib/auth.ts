import "server-only";
import type { User } from "@/generated/prisma/client";

/**
 * Utilizador com sessão iniciada, ou null.
 *
 * TODO(Auth0): ler a sessão do Auth0, encontrar (ou criar) o User local pelo
 * email e devolvê-lo. É o único sítio a mudar: o checkout e o backoffice já
 * chamam esta função. Até lá ninguém tem sessão.
 */
export async function getCurrentUser(): Promise<User | null> {
  return null;
}
