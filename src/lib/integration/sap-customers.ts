import "server-only";
import { sapBatch, sapDelete, sapGet, sapPatch, sapPost } from "./sap";
import { IntegrationError, withLog } from "./log";

// Cliente no SAP (o mesmo processo da app "Manage Customer Master Data"):
// cria um rascunho, preenche-o e ativa-o. Só depois de ativo tem nº de parceiro.
// Um parceiro ativo não se apaga por API.

const SERVICE = "MD_CUSTOMER_MASTER_SRV_01";
const PERSON = "1"; // categoria de parceiro: pessoa
const GROUPING = "0001"; // numeração interna, igual aos clientes dos outros grupos
const ROLES = ["FLCU01", "FLCU00"]; // cliente (vendas) e cliente (financeiro)

export type SapCustomerData = {
  name: string;
  address: string;
  postalCode: string;
  city: string;
};

type Retry = { action: string; payload: unknown };
type Entity = { __metadata: { uri: string } };

// O URI devolvido pelo SAP termina na chave da entidade, ex.: C_BusinessPartnerAddress(...)
const entityPath = (e: Entity) => e.__metadata.uri.split("/").pop()!;

/**
 * Na ativação, o SAP só guarda a rua e a cidade dos campos CustomerSupplier...:
 * StreetName e CityName aparecem no rascunho, mas perdem-se sem dar erro.
 */
function addressFields(customer: SapCustomerData) {
  return {
    CustomerSupplierStreetName: customer.address,
    StreetName: customer.address,
    PostalCode: customer.postalCode,
    CustomerSupplierCityName: customer.city,
    CityName: customer.city,
  };
}

/** O SAP exige apelido: a última palavra do nome é o apelido, o resto o nome próprio. */
function splitName(name: string) {
  const words = name.trim().split(/\s+/);
  const lastName = words.pop()!;
  return { firstName: words.join(" "), lastName };
}

/** Devolve null em vez de erro se o SAP responder 404: aqui, "não existe" é uma resposta normal. */
async function orNullIfMissing<T>(call: () => Promise<T>): Promise<T | null> {
  try {
    return await call();
  } catch (err) {
    if (err instanceof IntegrationError && err.status === 404) return null;
    throw err;
  }
}

const draftKey = (draftUuid: string) =>
  `C_BusinessPartnerCustomer(BusinessPartner='',DraftUUID=guid'${draftUuid}',IsActiveEntity=false)`;

/** Cria e preenche o rascunho. Devolve o DraftUUID. */
export async function createCustomerDraft(customer: SapCustomerData, reference: string, retry: Retry): Promise<string> {
  // Cada chamada fica no IntegrationLog; o retorno vai para o log, por isso nunca leva dados pessoais
  const step = <T>(operation: string, call: () => Promise<T>) =>
    withLog({ system: "SAP", operation, reference, retry }, call);

  const draft = await step("POST C_BusinessPartnerCustomerCreate", async () => {
    const d = await sapPost<{ DraftUUID: string }>(SERVICE, "C_BusinessPartnerCustomerCreate", {
      query: { BusinessPartner: "''", BusinessPartnerCategory: `'${PERSON}'`, BusinessPartnerGrouping: `'${GROUPING}'` },
    });
    return { draftUuid: d.DraftUUID };
  });

  const key = draftKey(draft.draftUuid);

  try {
    const { firstName, lastName } = splitName(customer.name);
    await step("PATCH C_BusinessPartnerCustomer (nome)", () =>
      sapPatch(SERVICE, key, {
        BusinessPartnerGrouping: GROUPING,
        FirstName: firstName,
        LastName: lastName,
        SearchTerm1: lastName.toUpperCase().slice(0, 20),
      }),
    );

    // A morada e a primeira função já vêm criadas, vazias, no rascunho
    const address = await step("GET to_BusinessPartnerAddress", async () => {
      const { results } = await sapGet<{ results: Entity[] }>(SERVICE, `${key}/to_BusinessPartnerAddress`);
      return entityPath(results[0]);
    });
    await step("PATCH C_BusinessPartnerAddress", () =>
      sapPatch(SERVICE, address, { Country: "PT", CorrespondenceLanguage: "PT", ...addressFields(customer) }),
    );

    const firstRole = await step("GET to_BusinessPartnerRole", async () => {
      const { results } = await sapGet<{ results: Entity[] }>(SERVICE, `${key}/to_BusinessPartnerRole`);
      return entityPath(results[0]);
    });
    await step(`PATCH função ${ROLES[0]}`, () => sapPatch(SERVICE, firstRole, { BusinessPartnerRoleForEdit: ROLES[0] }));

    const secondRole = await step("POST to_BusinessPartnerRole", async () =>
      entityPath(await sapPost<Entity>(SERVICE, `${key}/to_BusinessPartnerRole`, { body: {} })),
    );
    await step(`PATCH função ${ROLES[1]}`, () => sapPatch(SERVICE, secondRole, { BusinessPartnerRoleForEdit: ROLES[1] }));

  } catch (err) {
    // Não deixa rascunhos a meio no SAP: o "Tentar novamente" cria um novo.
    // Se a limpeza falhar, o erro original é o que interessa mostrar.
    await step("DELETE rascunho incompleto", () => sapDelete(SERVICE, key)).catch(() => {});
    throw err;
  }

  return draft.draftUuid;
}

/**
 * Altera um parceiro ativo: abre-o em rascunho, muda o nome e a morada e ativa.
 * Como na criação, a preparação e a ativação têm de ir no mesmo $batch.
 */
export async function updateSapCustomer(businessPartner: string, customer: SapCustomerData, reference: string, retry: Retry) {
  const step = <T>(operation: string, call: () => Promise<T>) =>
    withLog({ system: "SAP", operation, reference, retry }, call);

  const draft = await step("POST C_BusinessPartnerCustomerEdit", async () => {
    const d = await sapPost<Entity & { DraftUUID: string }>(SERVICE, "C_BusinessPartnerCustomerEdit", {
      query: {
        BusinessPartner: `'${businessPartner}'`,
        DraftUUID: "guid'00000000-0000-0000-0000-000000000000'",
        IsActiveEntity: "true",
        PreserveChanges: "false",
      },
    });
    return { path: entityPath(d), uuid: d.DraftUUID };
  });

  try {
    const { firstName, lastName } = splitName(customer.name);
    await step("PATCH C_BusinessPartnerCustomer (nome)", () =>
      sapPatch(SERVICE, draft.path, { FirstName: firstName, LastName: lastName, SearchTerm1: lastName.toUpperCase().slice(0, 20) }),
    );
    const address = await step("GET to_BusinessPartnerAddress", async () => {
      const { results } = await sapGet<{ results: Entity[] }>(SERVICE, `${draft.path}/to_BusinessPartnerAddress`);
      return entityPath(results[0]);
    });
    await step("PATCH C_BusinessPartnerAddress", () =>
      sapPatch(SERVICE, address, addressFields(customer)),
    );

    const params = `BusinessPartner='${businessPartner}'&DraftUUID=guid'${draft.uuid}'&IsActiveEntity=false`;
    await step("POST $batch (Preparation + Activation)", async () => {
      await sapBatch(SERVICE, [
        `C_BusinessPartnerCustomerPreparation?${params}&SideEffectsQualifier=''`,
        `C_BusinessPartnerCustomerActivation?${params}`,
      ]);
      return { ativado: true };
    });
  } catch (err) {
    // Não deixa o parceiro preso num rascunho: o ativo fica como estava
    await step("DELETE rascunho incompleto", () => sapDelete(SERVICE, draft.path)).catch(() => {});
    throw err;
  }
}

export type DraftState = { state: "rascunho" } | { state: "ativo"; businessPartner: string } | { state: "removido" };

/**
 * Valida e ativa o rascunho. Devolve o nº de parceiro. As duas operações têm de
 * ir no mesmo $batch: em pedidos separados, o SAP responde "Ocorreu uma exceção".
 */
export async function activateCustomerDraft(draftUuid: string, reference: string, retry: Retry): Promise<string> {
  const params = `BusinessPartner=''&DraftUUID=guid'${draftUuid}'&IsActiveEntity=false`;
  const { businessPartner } = await withLog({ system: "SAP", operation: "POST $batch (Preparation + Activation)", reference, retry }, async () => {
    const d = await sapBatch<{ BusinessPartner: string }>(SERVICE, [
      `C_BusinessPartnerCustomerPreparation?${params}&SideEffectsQualifier=''`,
      `C_BusinessPartnerCustomerActivation?${params}`,
    ]);
    return { businessPartner: d.BusinessPartner };
  });
  return businessPartner;
}

/**
 * Vê o que aconteceu a um rascunho que ficou por ativar. Ao ser ativado no Fiori, deixa de
 * existir e o SAP não diz qual foi o nº atribuído: procuramos o parceiro ativo
 * criado pelo nosso utilizador com o mesmo nome (o mais recente, se houver vários).
 * "linked" são os nºs já ligados a outros clientes da loja.
 */
export async function checkCustomerDraft(draftUuid: string, name: string, reference: string, linked: string[]): Promise<DraftState> {
  return withLog({ system: "SAP", operation: "GET estado do rascunho", reference }, async () => {
    const draft = await orNullIfMissing(() => sapGet(SERVICE, draftKey(draftUuid)));
    if (draft) return { state: "rascunho" };

    const { firstName, lastName } = splitName(name);
    const quote = (value: string) => `'${value.replace(/'/g, "''")}'`; // em OData, ' escreve-se ''
    const { results } = await sapGet<{ results: { BusinessPartner: string; FirstName: string }[] }>(SERVICE, "C_BusinessPartnerCustomer", {
      $filter: `LastName eq ${quote(lastName)} and CreatedByUser eq ${quote(process.env.SAP_USER ?? "")} and IsActiveEntity eq true`,
      $orderby: "CreationDate desc",
      $top: "20",
    });
    const partner = results.find((r) => r.FirstName === firstName && !linked.includes(r.BusinessPartner));
    return partner ? { state: "ativo", businessPartner: partner.BusinessPartner } : { state: "removido" };
  });
}

/** Apaga um rascunho. Se já não existir, não é erro. */
export async function deleteCustomerDraft(draftUuid: string, reference: string) {
  await withLog({ system: "SAP", operation: "DELETE rascunho do cliente", reference }, async () => {
    await orNullIfMissing(() => sapDelete(SERVICE, draftKey(draftUuid)));
    return { apagado: true };
  });
}
