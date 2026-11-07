"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import {
  clearAttempts,
  createSession,
  destroyOtherSessions,
  destroySession,
  getCurrentUser,
  hashPassword,
  recordFailedAttempt,
  tooManyAttempts,
  verifyPassword,
} from "@/lib/auth";
import { attachCartToUser, forgetCart } from "@/lib/cart";
import { normalizeCustomer, validateCustomer, validatePassword } from "@/lib/customer-validation";
import { registerCustomer, updateCustomer } from "@/lib/customers";
import { db } from "@/lib/db";

export type AccountFormState = { ok?: boolean; message: string; errors?: Record<string, string> } | null;

const NIF_REJECTED = "Este NIF não foi aceite. Confirme o número.";

const text = (fd: FormData, name: string) => String(fd.get(name) ?? "").trim();
// Espaços numa password contam: só o resto dos campos leva trim
const secret = (fd: FormData, name: string) => String(fd.get(name) ?? "");
// Só destinos conhecidos: um "voltar" livre podia mandar o cliente para outro site
const nextPage = (fd: FormData) => (text(fd, "voltar") === "checkout" ? "/checkout" : "/conta");

function profileFields(fd: FormData) {
  return normalizeCustomer({
    nif: text(fd, "nif") || null,
    address: text(fd, "address"),
    postalCode: text(fd, "postalCode"),
    city: text(fd, "city"),
  });
}

export async function login(_prev: AccountFormState, fd: FormData): Promise<AccountFormState> {
  const email = text(fd, "email").toLowerCase();
  if (await tooManyAttempts(email)) {
    return { message: "Demasiadas tentativas. Tente novamente dentro de 15 minutos." };
  }

  const user = await db.user.findUnique({ where: { email } });
  if (!(await verifyPassword(secret(fd, "password"), user))) {
    await recordFailedAttempt(email);
    // A mesma mensagem nos dois casos, para não revelar que emails têm conta
    return { message: "Email ou palavra-passe incorretos." };
  }

  await clearAttempts(email);
  await createSession(user!.id);
  await attachCartToUser(user!.id);
  redirect(nextPage(fd));
}

export async function register(_prev: AccountFormState, fd: FormData): Promise<AccountFormState> {
  const password = secret(fd, "password");
  const firstName = text(fd, "firstName");
  const lastName = text(fd, "lastName");
  const data = {
    name: `${firstName} ${lastName}`.trim(),
    email: text(fd, "email").toLowerCase(),
    ...profileFields(fd),
  };

  const errors = validateCustomer(data);
  // O formulário tem nome e apelido separados: o erro aparece no campo em falta
  if (errors.name) {
    delete errors.name;
    if (!firstName) errors.firstName = "Indique o nome.";
    if (!lastName) errors.lastName = "Indique o apelido.";
  }
  const passwordProblem = validatePassword(password);
  if (passwordProblem) errors.password = passwordProblem;
  if (fd.get("terms") !== "on") errors.terms = "Tem de aceitar os termos para criar conta.";
  if (!errors.email && (await db.user.findUnique({ where: { email: data.email } }))) {
    errors.email = "Já existe uma conta com este email.";
  }
  if (Object.keys(errors).length > 0) return { message: "Corrija os campos assinalados.", errors };

  // Se o Moloni ou o SAP falharem, a conta fica criada e o erro fica no monitor de integração
  const result = await registerCustomer({ ...data, passwordHash: await hashPassword(password) });
  if (result.nifRejected) return { message: "Corrija os campos assinalados.", errors: { nif: NIF_REJECTED } };

  await createSession(result.user.id);
  await attachCartToUser(result.user.id);
  const next = nextPage(fd);
  redirect(next === "/conta" ? "/conta?bemvindo=1" : next);
}

export async function logout() {
  await destroySession();
  await forgetCart();
  redirect("/conta");
}

export async function updateProfile(_prev: AccountFormState, fd: FormData): Promise<AccountFormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/conta");

  const changes = { name: text(fd, "name"), email: text(fd, "email").toLowerCase(), ...profileFields(fd) };
  const errors = validateCustomer(changes);
  if (!errors.email && changes.email !== user.email && (await db.user.findUnique({ where: { email: changes.email } }))) {
    errors.email = "Já existe uma conta com este email.";
  }
  if (Object.keys(errors).length > 0) return { message: "Corrija os campos assinalados.", errors };

  const result = await updateCustomer(user.id, changes);
  if (result.nifRejected) return { message: "Corrija os campos assinalados.", errors: { nif: NIF_REJECTED } };

  refresh();
  if (result.moloniOk && result.sapOk) return { ok: true, message: "Dados atualizados." };
  return { ok: true, message: "Dados guardados. A atualização nos nossos sistemas será concluída em breve." };
}

export async function changePassword(_prev: AccountFormState, fd: FormData): Promise<AccountFormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/conta");

  if (await tooManyAttempts(user.email)) {
    return { message: "Demasiadas tentativas. Tente novamente dentro de 15 minutos." };
  }
  if (!(await verifyPassword(secret(fd, "current"), user))) {
    await recordFailedAttempt(user.email);
    return { message: "Corrija os campos assinalados.", errors: { current: "A palavra-passe atual está incorreta." } };
  }

  const password = secret(fd, "password");
  const problem = validatePassword(password);
  if (problem) return { message: "Corrija os campos assinalados.", errors: { password: problem } };

  await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password) } });
  await destroyOtherSessions(user.id); // quem tinha a password antiga deixa de ter acesso
  return { ok: true, message: "Palavra-passe alterada." };
}
