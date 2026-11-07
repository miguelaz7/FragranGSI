"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { deleteCustomer, registerCustomer, updateCustomer } from "@/lib/customers";
import { normalizeCustomer, validateCustomer, validatePassword } from "@/lib/customer-validation";

// TODO(admin): confirmar que quem chama é admin (getCurrentUser) antes de executar.

export type CustomerFormState = { ok?: boolean; message: string; errors?: Record<string, string> } | null;

const text = (fd: FormData, name: string) => String(fd.get(name) ?? "").trim();

function readCustomer(fd: FormData) {
  return normalizeCustomer({
    name: text(fd, "name"),
    email: text(fd, "email").toLowerCase(),
    nif: text(fd, "nif") || null,
    address: text(fd, "address"),
    postalCode: text(fd, "postalCode"),
    city: text(fd, "city"),
  });
}

export async function createCustomer(_prev: CustomerFormState, fd: FormData): Promise<CustomerFormState> {
  const data = readCustomer(fd);
  const errors = validateCustomer(data);
  if (!errors.email && (await db.user.findUnique({ where: { email: data.email } }))) {
    errors.email = "Já existe um cliente com este email.";
  }
  if (Object.keys(errors).length > 0) return { message: "Corrija os campos assinalados.", errors };

  const result = await registerCustomer(data);
  if (result.nifRejected) return { message: "Corrija os campos assinalados.", errors: { nif: "O Moloni não aceitou este NIF." } };
  redirect(`/admin/clientes?criado=1&moloni=${result.moloniOk ? 1 : 0}&sap=${result.sapOk ? 1 : 0}`);
}

/** Edita um cliente existente: grava na BD e envia para o Moloni e para o SAP. */
export async function saveCustomer(_prev: CustomerFormState, fd: FormData): Promise<CustomerFormState> {
  const id = text(fd, "id");
  const data = readCustomer(fd);

  const errors = validateCustomer(data);
  const sameEmail = await db.user.findUnique({ where: { email: data.email } });
  if (!errors.email && sameEmail && sameEmail.id !== id) errors.email = "Já existe um cliente com este email.";
  if (Object.keys(errors).length > 0) return { message: "Corrija os campos assinalados.", errors };

  const result = await updateCustomer(id, data);
  if (result.nifRejected) return { message: "Corrija os campos assinalados.", errors: { nif: "O Moloni não aceitou este NIF." } };

  refresh();
  if (result.moloniOk && result.sapOk) return { ok: true, message: "Cliente atualizado no Moloni e no SAP." };
  const failed = [!result.moloniOk && "Moloni", !result.sapOk && "SAP"].filter(Boolean).join(" e ");
  return { ok: false, message: `Guardado na loja, mas falhou: ${failed}. Pode repetir no monitor de integração.` };
}

export async function removeCustomer(_prev: string | null, fd: FormData): Promise<string | null> {
  let sapBusinessPartner: string | null;
  try {
    ({ sapBusinessPartner } = await deleteCustomer(text(fd, "id")));
  } catch (err) {
    return err instanceof Error ? err.message : "Não foi possível apagar o cliente.";
  }
  // redirect() funciona lançando uma exceção, por isso fica fora do try
  redirect(`/admin/clientes?apagado=1${sapBusinessPartner ? `&parceiro=${sapBusinessPartner}` : ""}`);
}

/**
 * Dá acesso à loja a um cliente criado no backoffice, ou repõe a password de quem
 * se esqueceu (não há recuperação automática). Termina as sessões que tinha abertas.
 */
export async function setCustomerPassword(_prev: string | null, fd: FormData): Promise<string | null> {
  const password = String(fd.get("password") ?? "");
  const problem = validatePassword(password);
  if (problem) return problem;

  const userId = text(fd, "id");
  await db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(password) } });
  await db.session.deleteMany({ where: { userId } });
  return "Palavra-passe definida.";
}
