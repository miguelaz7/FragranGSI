import "server-only";
import { IntegrationError, withLog } from "./log";
import { parseODataDate, sapBatch, sapConfig, sapDelete, sapGet, sapPatch, sapPost } from "./sap";

// Altera o preço (condição PR00) de um material no SAP, como a app Manage Prices:
// abre o registo em rascunho, muda o valor e ativa. Enquanto o rascunho está aberto,
// o registo ativo desaparece da listagem e o produto parece não ter preço.

const SERVICE = "SD_PRICING_CONDITIONRECORD_SRV";
const EDIT = "AE3B72B4F1AA3073D427AEditconditionrecord";

type Retry = { action: string; payload: unknown };
type PriceRecord = {
  ConditionRecordUUID: string;
  ConditionValidityStartDate: string;
  ConditionValidityEndDate: string;
  IsActiveEntity: boolean;
};

export async function updateSapPrice(sapProduct: string, price: number, reference: string, retry: Retry) {
  const step = <T>(operation: string, call: () => Promise<T>) =>
    withLog({ system: "SAP", operation, reference, retry }, call);

  const { salesOrg, channel } = sapConfig();
  const records = await step("GET C_SlsPricingConditionRecordTP (PR00)", async () => {
    const { results } = await sapGet<{ results: PriceRecord[] }>(SERVICE, "C_SlsPricingConditionRecordTP", {
      $filter:
        `ConditionTable eq '304' and ConditionType eq 'PR00' and SalesOrganization eq '${salesOrg}'` +
        ` and DistributionChannel eq '${channel}' and Material eq '${sapProduct}'`,
      $top: "10",
    });
    return results;
  });

  if (records.some((r) => !r.IsActiveEntity)) {
    throw new IntegrationError("SAP", "Este preço tem um rascunho aberto no SAP. Grave-o ou cancele-o em Manage Prices e tente de novo.");
  }
  const now = new Date();
  const current = records.find(
    (r) => parseODataDate(r.ConditionValidityStartDate) <= now && parseODataDate(r.ConditionValidityEndDate) >= now,
  );
  // Ainda sem preço (perfume novo): cria o primeiro registo PR00
  if (!current) return createSapPrice(sapProduct, price, step);

  const uuid = current.ConditionRecordUUID;
  const draft = draftKey(uuid);
  const activate = () => activateDraft(uuid, step);

  await step("POST Editconditionrecord", async () => {
    // Aqui o UUID é um parâmetro de texto, não um guid
    await sapPost(SERVICE, EDIT, {
      query: { ConditionRecordUUID: `'${uuid}'`, IsActiveEntity: "true", Preservechanges: "false", Totalcount: "1" },
    });
    return { rascunho: true };
  });

  try {
    // O valor fica em ConditionRateAmount: um PATCH a ConditionRateValue é ignorado sem erro
    await step("PATCH ConditionRateAmount", () => sapPatch(SERVICE, draft, { ConditionRateAmount: price.toFixed(2) }));
  } catch (err) {
    // Não deixa o rascunho aberto: ativar sem alterações repõe o registo como estava
    await activate().catch(() => {});
    throw err;
  }

  const { amount } = await activate();
  if (amount !== price) {
    throw new IntegrationError("SAP", `O SAP ficou com ${amount} € em vez de ${price} €.`);
  }
}

type Step = <T>(operation: string, call: () => Promise<T>) => Promise<T>;

const draftKey = (uuid: string) => `C_SlsPricingConditionRecordTP(ConditionRecordUUID=guid'${uuid}',IsActiveEntity=false)`;

/** Ativa um rascunho de preço. Tal como nos clientes, as duas operações têm de ir no mesmo $batch. */
function activateDraft(uuid: string, step: Step) {
  const params = `ConditionRecordUUID=guid'${uuid}'&IsActiveEntity=false`;
  return step("POST $batch (Preparation + Activation)", async () => {
    const d = await sapBatch<{ ConditionRateAmount: string }>(SERVICE, [
      `C_SlsPricingConditionRecordTPPreparation?${params}&SideEffectsQualifier=''`,
      `C_SlsPricingConditionRecordTPActivation?${params}`,
    ]);
    return { amount: Number(d.ConditionRateAmount) };
  });
}

/**
 * Primeiro preço de um material, como "Criar" na app Manage Prices (testado a 11/11 no
 * PERF004-093): POST cria o rascunho com a chave da tabela 304 e o SAP preenche o resto
 * (EUR, por 1 unidade, válido de hoje até 31/12/9999) → PATCH do valor → $batch com
 * Preparation + Activation. Fica Liberado, sem aprovação. Se já houver um preço ativo
 * nessas datas, o SAP fecha-o na véspera.
 */
async function createSapPrice(sapProduct: string, price: number, step: Step) {
  const { salesOrg, channel } = sapConfig();
  const { ConditionRecordUUID: uuid } = await step("POST C_SlsPricingConditionRecordTP (novo PR00)", () =>
    sapPost<{ ConditionRecordUUID: string }>(SERVICE, "C_SlsPricingConditionRecordTP", {
      body: { ConditionType: "PR00", ConditionTable: "304", SalesOrganization: salesOrg, DistributionChannel: channel, Material: sapProduct },
    }),
  );

  try {
    // O rascunho vem sem unidade; EA é a unidade base dos nossos materiais
    await step("PATCH ConditionRateAmount", () =>
      sapPatch(SERVICE, draftKey(uuid), { ConditionRateAmount: price.toFixed(2), ConditionQuantityUnit: "EA" }),
    );
    const { amount } = await activateDraft(uuid, step);
    if (amount !== price) throw new IntegrationError("SAP", `O SAP ficou com ${amount} € em vez de ${price} €.`);
  } catch (err) {
    // Um rascunho esquecido bloquearia as alterações seguintes ("rascunho aberto")
    await sapDelete(SERVICE, draftKey(uuid)).catch(() => {});
    throw err;
  }
}
