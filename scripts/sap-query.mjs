// Consulta rápida a um serviço OData do SAP, para explorar dados a partir do terminal.
// As credenciais vêm do .env e nunca são impressas.
//
// Uso:
//   node scripts/sap-query.mjs <SERVIÇO> <EntitySet> "<$filter>" [top] [campo1,campo2,...]
// Exemplo:
//   node scripts/sap-query.mjs UI_PRODUCTLIST ProductList "Product eq 'PERF001-093'" 10 Product,Plant,ProductDescription
import "dotenv/config";

const [service, entitySet, filter, top = "20", fields] = process.argv.slice(2);
if (!service || !entitySet) {
  console.error('Uso: node scripts/sap-query.mjs <SERVIÇO> <EntitySet> "<$filter>" [top] [campos]');
  process.exit(1);
}

const { SAP_BASE_URL, SAP_USER, SAP_PASSWORD, SAP_CLIENT } = process.env;
const params = new URLSearchParams({ $format: "json", $top: top });
if (SAP_CLIENT) params.set("sap-client", SAP_CLIENT);
if (filter) params.set("$filter", filter);

const res = await fetch(`${SAP_BASE_URL.replace(/\/$/, "")}/${service}/${entitySet}?${params}`, {
  headers: { Authorization: "Basic " + Buffer.from(`${SAP_USER}:${SAP_PASSWORD}`).toString("base64") },
  signal: AbortSignal.timeout(120_000),
});
if (!res.ok) {
  const body = await res.text();
  let msg = body.slice(0, 500);
  try {
    msg = JSON.parse(body).error.message.value;
  } catch {}
  console.error(`HTTP ${res.status}: ${msg}`);
  process.exit(1);
}

const rows = (await res.json()).d.results;
console.log(`${rows.length} linha(s)`);
const cols = fields ? fields.split(",") : null;
for (const row of rows) {
  if (cols) console.log(cols.map((c) => `${c}=${row[c] ?? ""}`).join(" | "));
  else {
    // Mostra só os campos simples (sem __metadata nem navegações)
    console.log(Object.fromEntries(Object.entries(row).filter(([, v]) => typeof v !== "object")));
  }
}
