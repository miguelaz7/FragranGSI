import "server-only";
import { db } from "@/lib/db";
import type { User } from "@/generated/prisma/client";
import { moloniCall, moloniIds } from "@/lib/integration/moloni";
import { IntegrationError, withLog } from "@/lib/integration/log";
import { activateCustomerDraft, checkCustomerDraft, createCustomerDraft, deleteCustomerDraft, updateSapCustomer } from "@/lib/integration/sap-customers";

// Registo de clientes: guarda na BD e cria o cliente nos dois ERPs.
// - Moloni: cliente real, usado na faturação.
// - SAP: parceiro de negócios ativo, com o nº guardado em sapBusinessPartner.
// O Moloni vai primeiro porque valida o NIF com mais rigor do que nós: se o recusar,
// não se grava nada. Noutras falhas, um ERP não trava o outro e o erro fica no monitor
// de integração com "Tentar novamente".

export type NewCustomer = {
  name: string;
  email: string;
  nif: string | null;
  address: string;
  postalCode: string;
  city: string;
  passwordHash?: string; // só nos clientes registados na loja
};

const FINAL_CONSUMER_NIF = "999999990"; // NIF usado quando o cliente não indica o seu
// IDs da empresa FragranGSI no Moloni
const MOLONI_PORTUGAL = 1;
const MOLONI_PORTUGUESE = 1;
const MOLONI_MULTIBANCO = 3460740;
const MOLONI_PRONTO_PAGAMENTO = 2662835;

// Na referência do log vai o id: o nome e o email do cliente não ficam no log
const logReference = (user: User) => `Cliente ${user.id}`;

/** Dados do cliente no Moloni, iguais ao criar e ao alterar. */
function moloniFields(user: User) {
  return {
    company_id: moloniIds().company_id,
    vat: user.nif ?? FINAL_CONSUMER_NIF,
    name: user.name,
    language_id: MOLONI_PORTUGUESE,
    address: user.address,
    zip_code: user.postalCode,
    city: user.city,
    country_id: MOLONI_PORTUGAL,
    email: user.email,
    maturity_date_id: MOLONI_PRONTO_PAGAMENTO,
    payment_method_id: MOLONI_MULTIBANCO,
    salesman_id: 0,
    payment_day: 0,
    discount: 0,
    credit_limit: 0,
    delivery_method_id: 0,
  };
}

async function createMoloniCustomer(user: User) {
  const retry = { action: "cliente-moloni", payload: { userId: user.id } };
  const reference = logReference(user);
  const { company_id } = moloniIds();

  const { number } = await withLog({ system: "Moloni", operation: "POST customers/getNextNumber", reference, retry }, () =>
    moloniCall<{ number: string }>("customers/getNextNumber", { company_id }),
  );

  const { customer_id } = await withLog({ system: "Moloni", operation: "POST customers/insert", reference, retry }, () =>
    moloniCall<{ customer_id: number }>("customers/insert", { ...moloniFields(user), number }),
  );

  await db.user.update({ where: { id: user.id }, data: { moloniCustomerId: customer_id } });
}

/**
 * Cria o rascunho (se ainda não existir) e ativa-o. O rascunho é guardado antes
 * de ativar: se a ativação falhar, repetir não cria outro.
 */
async function createSapCustomer(user: User) {
  const retry = { action: "cliente-sap", payload: { userId: user.id } };
  const reference = logReference(user);

  let draftUuid = user.sapDraftUuid;
  if (!draftUuid) {
    draftUuid = await createCustomerDraft(
      { name: user.name, address: user.address ?? "", postalCode: user.postalCode ?? "", city: user.city ?? "" },
      reference,
      retry,
    );
    await db.user.update({ where: { id: user.id }, data: { sapDraftUuid: draftUuid } });
  }

  const businessPartner = await activateCustomerDraft(draftUuid, reference, retry);
  await db.user.update({ where: { id: user.id }, data: { sapBusinessPartner: businessPartner, sapDraftUuid: null } });
}

/** O Moloni responde ["8 vat"] a um NIF que não aceita. */
const isNifRejected = (err: unknown) => err instanceof IntegrationError && /\bvat\b/.test(err.message);

/** Cria o cliente na BD, no Moloni e no SAP. Se o NIF for recusado, não fica nada criado. */
export async function registerCustomer(data: NewCustomer) {
  // Sem password (clientes do backoffice), o cliente não consegue entrar na loja
  const user = await db.user.create({ data: { ...data, passwordHash: data.passwordHash ?? "" } });

  let moloniOk = true;
  try {
    await createMoloniCustomer(user);
  } catch (err) {
    if (isNifRejected(err)) {
      await db.user.delete({ where: { id: user.id } });
      return { nifRejected: true as const };
    }
    moloniOk = false;
  }

  const sapOk = await createSapCustomer(user).then(() => true, () => false);
  return { nifRejected: false as const, user, moloniOk, sapOk };
}

/** Atualiza um cliente com o que aconteceu ao rascunho no SAP. Devolve-o atualizado. */
async function syncDraft(user: User): Promise<User> {
  if (!user.sapDraftUuid || user.sapBusinessPartner) return user;

  const others = await db.user.findMany({ where: { sapBusinessPartner: { not: null } }, select: { sapBusinessPartner: true } });
  const linked = others.map((u) => u.sapBusinessPartner!);
  const result = await checkCustomerDraft(user.sapDraftUuid, user.name, logReference(user), linked);

  if (result.state === "rascunho") return user;
  return db.user.update({
    where: { id: user.id },
    data: { sapDraftUuid: null, sapBusinessPartner: result.state === "ativo" ? result.businessPartner : null },
  });
}

/** Vê no SAP os clientes que ficaram em rascunho, porque podem ter sido ativados no Fiori. */
export async function syncSapDrafts() {
  const pending = await db.user.findMany({ where: { sapDraftUuid: { not: null }, sapBusinessPartner: null } });
  for (const user of pending) await syncDraft(user);
}

/**
 * Apaga o cliente do Moloni, o rascunho do SAP e a conta na BD. Um parceiro já
 * ativo não se apaga por API e fica no SAP. Cada passo é guardado logo: se um
 * falhar, voltar a apagar continua a partir daí. Devolve o nº que ficou no SAP.
 */
export async function deleteCustomer(userId: string): Promise<{ sapBusinessPartner: string | null }> {
  // As faturas e encomendas têm de continuar ligadas a quem comprou
  const orders = await db.order.count({ where: { userId } });
  if (orders > 0) throw new Error("Este cliente tem encomendas e não pode ser apagado.");

  const user = await syncDraft(await db.user.findUniqueOrThrow({ where: { id: userId } }));
  const reference = logReference(user);

  if (user.moloniCustomerId) {
    const { company_id } = moloniIds();
    await withLog({ system: "Moloni", operation: "POST customers/delete", reference }, () =>
      moloniCall("customers/delete", { company_id, customer_id: user.moloniCustomerId }),
    );
    await db.user.update({ where: { id: user.id }, data: { moloniCustomerId: null } });
  }

  if (user.sapDraftUuid) {
    await deleteCustomerDraft(user.sapDraftUuid, reference);
    await db.user.update({ where: { id: user.id }, data: { sapDraftUuid: null } });
  }

  await db.user.delete({ where: { id: user.id } });
  return { sapBusinessPartner: user.sapBusinessPartner };
}

type ProfileChanges = Pick<User, "name" | "email" | "nif" | "address" | "postalCode" | "city">;

async function pushToMoloni(user: User) {
  // Sem cliente no Moloni (a criação falhou, por exemplo por causa do NIF): cria agora
  if (!user.moloniCustomerId) return createMoloniCustomer(user);

  const { company_id } = moloniIds();
  const customer_id = user.moloniCustomerId;
  const log = (operation: string) => ({
    system: "Moloni" as const,
    operation,
    reference: logReference(user),
    retry: { action: "cliente-moloni-dados", payload: { userId: user.id } },
  });

  // O número de cliente é obrigatório ao alterar e não está guardado na BD
  const number = await withLog(log("POST customers/getOne"), async () => {
    const customer = await moloniCall<{ number: string }>("customers/getOne", { company_id, customer_id });
    return customer.number;
  });
  await withLog(log("POST customers/update"), () =>
    moloniCall("customers/update", { ...moloniFields(user), customer_id, number }),
  );
}

async function pushToSap(user: User) {
  if (!user.sapBusinessPartner) return;
  await updateSapCustomer(
    user.sapBusinessPartner,
    { name: user.name, address: user.address ?? "", postalCode: user.postalCode ?? "", city: user.city ?? "" },
    logReference(user),
    { action: "cliente-sap-dados", payload: { userId: user.id } },
  );
}

/** Altera os dados do cliente, na loja ou no backoffice. O SAP não recebe o email nem o NIF. */
export async function updateCustomer(userId: string, changes: ProfileChanges) {
  const current = await db.user.findUniqueOrThrow({ where: { id: userId } });

  let moloniOk = true;
  try {
    await pushToMoloni({ ...current, ...changes });
  } catch (err) {
    if (isNifRejected(err)) return { nifRejected: true as const };
    moloniOk = false;
  }

  const user = await db.user.update({ where: { id: userId }, data: changes });
  const sapOk = await pushToSap(user).then(() => true, () => false);
  return { nifRejected: false as const, moloniOk, sapOk };
}

async function findUser(payload: unknown) {
  const { userId } = payload as { userId: string };
  return db.user.findUnique({ where: { id: userId } });
}

// "Tentar novamente" no monitor de integração. Não repetem o que já foi feito
// e não fazem nada se o cliente entretanto foi apagado.
export async function retryCustomerMoloni(payload: unknown) {
  const user = await findUser(payload);
  if (user && !user.moloniCustomerId) await createMoloniCustomer(user);
}

export async function retryCustomerSap(payload: unknown) {
  const user = await findUser(payload);
  if (!user) return;
  // O rascunho pode ter sido ativado no Fiori depois do erro
  const current = await syncDraft(user);
  if (!current.sapBusinessPartner) await createSapCustomer(current);
}

// Cada sistema repete só a sua parte. Se voltar a falhar, o erro segue para o monitor.
export async function retryCustomerMoloniUpdate(payload: unknown) {
  const user = await findUser(payload);
  if (user) await pushToMoloni(user);
}

export async function retryCustomerSapUpdate(payload: unknown) {
  const user = await findUser(payload);
  if (user) await pushToSap(user);
}
