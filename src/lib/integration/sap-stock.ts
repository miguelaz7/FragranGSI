import "server-only";
import { IntegrationError, withLog } from "./log";
import { sapConfig, sapGet, sapPost } from "./sap";

// Entradas de stock no SAP, como "Initial Entry of Stock" na app Fiori Manage Stock
// (movimento 561, stock de utilização livre). As APIs standard de movimentos de
// mercadoria dão 403, mas o serviço da própria app aceita o lançamento (testado a
// 11/11: documento de material 4900038651, PERF004-093 de 49 para 50 un.).

const SERVICE = "MMIM_MATDOC_SRV";
const STORAGE_LOCATION = "TG00";
const INITIAL_ENTRY = "1"; // "Managed Stock Type" da app: 1 = Initial Entry (movimento 561)

type Retry = { action: string; payload: unknown };

/** Stock de utilização livre de um material no SAP, lido agora (sem cache). */
export async function getSapStock(sapProduct: string, reference: string) {
  const { plant } = sapConfig();
  return withLog({ system: "SAP", operation: "GET C_STOCKQUANTITYVALUEBYTYPE", reference }, async () => {
    const { results } = await sapGet<{ results: { InventoryStockType: string; MatlWrhsStkQtyInMatlBaseUnit: string }[] }>(
      "C_STOCKQUANTITYVALUEBYTYPE_CDS",
      "C_STOCKQUANTITYVALUEBYTYPE",
      { $filter: `Plant eq '${plant}' and Material eq '${sapProduct}'` },
    );
    return results
      .filter((r) => r.InventoryStockType === "01")
      .reduce((sum, r) => sum + Number(r.MatlWrhsStkQtyInMatlBaseUnit), 0);
  });
}

/** Lança uma entrada de stock no SAP e devolve o número do documento de material. */
export async function postSapStockEntry(sapProduct: string, quantity: number, reference: string, retry: Retry) {
  const { plant } = sapConfig();
  // O SAP guarda as datas OData v2 como meia-noite UTC
  const now = new Date();
  const today = `/Date(${Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())})/`;

  return withLog({ system: "SAP", operation: "POST MatDocHeaders (entrada de stock 561)", reference, retry }, async () => {
    // O serviço exige todos os campos do documento, mesmo os vazios
    const doc = await sapPost<{ MaterialDocument: string; MaterialDocumentYear: string }>(SERVICE, "MatDocHeaders", {
      // Em português o SAP não reconhece a unidade EA ("não definida em idioma PT")
      query: { "sap-language": "EN" },
      // Os erros de lançamento vêm no cabeçalho sap-message, com HTTP 201
      failOnMessage: true,
      body: {
        MaterialDocument: "",
        MaterialDocumentYear: "",
        PostingDate: today,
        DocumentDate: today,
        Temp_key: "",
        ControlSignificance: "",
        VersionForPrintingSlip: "0",
        MaterialDocumentHeaderText: "fragranGSI",
        MatDocHeader2Items: [
          {
            MaterialDocument: "", MaterialDocumentYear: "", MaterialDocumentItem: "", AssignmentReference: "",
            MovementType: INITIAL_ENTRY,
            StockTypeAssignmentReference: "CurrentStock", // utilização livre
            Plant: plant,
            StorageLocation: STORAGE_LOCATION,
            Material: sapProduct,
            QuantityInEntryUnit: String(quantity),
            EntryUnit: "EA",
            Batch: "", InventorySpecialStockType: "", Supplier: "", SalesOrder: "", SalesOrderItem: "", WBSElement: "",
            StockType: "", GLAccount: "", CostCenter: "", DocumentItemText: "", GoodsMovementReasonCode: "",
            CurrentStock: "0", BlockedStockQuantity: "0", CreateSerialNoAutomatic: false,
          },
        ],
      },
    });
    if (!doc?.MaterialDocument) throw new IntegrationError("SAP", "O SAP não criou o documento de material.");
    return { materialDocument: doc.MaterialDocument, year: doc.MaterialDocumentYear, quantity };
  });
}
