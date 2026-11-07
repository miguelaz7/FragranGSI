import "server-only";
import { IntegrationError, withLog } from "./log";
import { sapBatch, sapConfig, sapDelete, sapGet, sapPatch, sapPost } from "./sap";

// Cria um material no SAP copiando um material modelo, como a app Manage Product
// Master Data: rascunho, acertos e ativação. Um material ativo não se apaga por API.
// O stock e o preço (PR00) são criados à parte, nas apps do SAP.

const SERVICE = "MD_C_PRODUCT_MAINTAIN_SRV";
const TEMPLATE = "OHMT1000"; // material modelo (tipo HAWA)
const STORAGE_LOCATION = "TG00";
const NO_DRAFT = "guid'00000000-0000-0000-0000-000000000000'";

type Retry = { action: string; payload: unknown };
type Entity = { __metadata: { uri: string } };
type Draft = Entity & { DraftUUID: string };

// O URI devolvido pelo SAP termina na chave da entidade
const entityPath = (e: Entity) => e.__metadata.uri.split("/").pop()!;

/** Existe em algum centro? Evita tentar criar um código que já está no SAP. */
export async function sapMaterialExists(sapProduct: string, reference: string) {
  return withLog({ system: "SAP", operation: "GET UI_PRODUCTLIST (material)", reference }, async () => {
    const { results } = await sapGet<{ results: unknown[] }>("UI_PRODUCTLIST", "ProductList", {
      $filter: `Product eq '${sapProduct}'`,
      $top: "1",
    });
    return results.length > 0;
  });
}

export async function createSapMaterial(sapProduct: string, name: string, reference: string, retry: Retry) {
  const { plant, salesOrg, channel } = sapConfig();
  // O retorno vai para o log, por isso cada passo devolve só o essencial
  const step = <T>(operation: string, call: () => Promise<T>) =>
    withLog({ system: "SAP", operation, reference, retry }, call);

  const draft = await step("POST C_ProductCopywithparams", async () => {
    const d = await sapPost<Draft>(SERVICE, "C_ProductCopywithparams", {
      query: {
        Product: `'${TEMPLATE}'`,
        DraftUUID: NO_DRAFT,
        IsActiveEntity: "true",
        Plant: `'${plant}'`,
        Storagelocation: `'${STORAGE_LOCATION}'`,
        Mrparea: "''",
        Salesorgdata: "''",
        Distributioncenter: "''",
        Store: "''",
        Storagelocationdc: "''",
        Mrpareadc: "''",
        Storagelocationstore: "''",
        Mrpareastore: "''",
        IsreferenceCopy: "''",
      },
    });
    return { path: entityPath(d), uuid: d.DraftUUID };
  });

  try {
    // Além do código e do nome, limpa o peso herdado do material modelo. O grupo (SFTY)
    // fica: é obrigatório e o SAP só tem os grupos do cenário Global Bike.
    await step("PATCH C_Product", () =>
      sapPatch(SERVICE, draft.path, {
        ProductForEdit: sapProduct,
        ProductDescription: name,
        GrossWeight: "0",
        NetWeight: "0",
        WeightUnit: "KG",
      }),
    );

    // O modelo traz descrições noutros idiomas: sem isto ficava "Off Road Helmet"
    const descriptions = await step("GET to_Description", async () => {
      const { results } = await sapGet<{ results: Entity[] }>(SERVICE, `${draft.path}/to_Description`);
      return results.map(entityPath);
    });
    for (const path of descriptions) {
      await step("PATCH C_Productdescription", () => sapPatch(SERVICE, path, { ProductDescription: name }));
    }

    // A cópia não traz dados de vendas, e sem eles não se pode criar o preço PR00
    const sales = await step("POST to_SalesDelivery", async () =>
      entityPath(await sapPost<Entity>(SERVICE, `${draft.path}/to_SalesDelivery`, { body: { ProductSalesOrg: salesOrg, ProductDistributionChnl: channel } })),
    );
    await step("PATCH C_Productsalesdelivery", () =>
      sapPatch(SERVICE, sales, { ProductSalesOrgForEdit: salesOrg, ProductDistributionChnlForEdit: channel }),
    );

    // Tal como nos clientes e nos preços, as duas operações têm de ir no mesmo $batch
    const params = `Product=''&DraftUUID=guid'${draft.uuid}'&IsActiveEntity=false`;
    const active = await step("POST $batch (Preparation + Activation)", async () => {
      const d = await sapBatch<{ Product: string; IsActiveEntity: boolean }>(SERVICE, [
        `C_ProductPreparation?${params}&SideEffectsQualifier=''`,
        `C_ProductActivation?${params}`,
      ]);
      return { product: d.Product, active: d.IsActiveEntity };
    });
    if (active.product !== sapProduct || !active.active) {
      throw new IntegrationError("SAP", `O SAP não confirmou o material ${sapProduct}.`);
    }
  } catch (err) {
    // Não deixa rascunhos a meio: "Tentar novamente" cria um novo.
    // Se a limpeza falhar, o erro original é o que interessa mostrar.
    await step("DELETE rascunho incompleto", () => sapDelete(SERVICE, draft.path)).catch(() => {});
    throw err;
  }
}
