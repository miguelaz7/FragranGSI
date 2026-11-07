"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { deleteCustomer, registerCustomer } from "@/lib/customers";

// TODO(Auth0): confirmar que quem chama é admin (getCurrentUser) antes de executar.

export type CustomerFormState = { message: string; errors?: Record<string, string> } | null;

const text = (fd: FormData, name: string) => String(fd.get(name) ?? "").trim();

/** Regra do NIF português: 9 dígitos, o último é um dígito de controlo (módulo 11). */
function isValidNif(nif: string) {
  if (!/^[1-9]\d{8}$/.test(nif)) return false;
  const sum = [...nif.slice(0, 8)].reduce((acc, digit, i) => acc + Number(digit) * (9 - i), 0);
  const check = 11 - (sum % 11);
  return (check >= 10 ? 0 : check) === Number(nif[8]);
}

export async function createCustomer(_prev: CustomerFormState, fd: FormData): Promise<CustomerFormState> {
  const data = {
    name: text(fd, "name"),
    email: text(fd, "email").toLowerCase(),
    nif: text(fd, "nif") || null,
    address: text(fd, "address"),
    postalCode: text(fd, "postalCode"),
    city: text(fd, "city"),
  };

  // Os limites de tamanho são os dos campos do SAP
  const errors: Record<string, string> = {};
  if (data.name.split(/\s+/).length < 2 || data.name.length > 80) errors.name = "Indique o nome e o apelido (máx. 80 caracteres).";
  if (!/^\S+@\S+\.\S+$/.test(data.email)) errors.email = "Email inválido.";
  if (data.nif && !isValidNif(data.nif)) errors.nif = "NIF inválido.";
  if (!data.address || data.address.length > 60) errors.address = "Indique a morada (máx. 60 caracteres).";
  if (!/^\d{4}-\d{3}$/.test(data.postalCode)) errors.postalCode = "Use o formato 4700-000.";
  if (!data.city || data.city.length > 40) errors.city = "Indique a localidade (máx. 40 caracteres).";

  if (!errors.email && (await db.user.findUnique({ where: { email: data.email } }))) {
    errors.email = "Já existe um cliente com este email.";
  }
  if (Object.keys(errors).length > 0) return { message: "Corrija os campos assinalados.", errors };

  const { moloniOk, sapOk } = await registerCustomer(data);
  redirect(`/admin/clientes?criado=1&moloni=${moloniOk ? 1 : 0}&sap=${sapOk ? 1 : 0}`);
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
