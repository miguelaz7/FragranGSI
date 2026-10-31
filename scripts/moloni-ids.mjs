// Lista os IDs do Moloni que a loja precisa no .env (empresa, série de
// documentos, taxa de IVA, unidade). Usa as credenciais do .env e não as imprime.
//
// Uso: node --env-file=.env scripts/moloni-ids.mjs [company_id]
const API = "https://api.moloni.pt/v1";
const { MOLONI_CLIENT_ID, MOLONI_CLIENT_SECRET, MOLONI_USERNAME, MOLONI_PASSWORD } = process.env;

for (const [k, v] of Object.entries({ MOLONI_CLIENT_ID, MOLONI_CLIENT_SECRET, MOLONI_USERNAME, MOLONI_PASSWORD })) {
  if (!v) {
    console.error(`Falta ${k} no .env`);
    process.exit(1);
  }
}

// 1) Token (grant password)
const grant = new URLSearchParams({
  grant_type: "password",
  client_id: MOLONI_CLIENT_ID,
  client_secret: MOLONI_CLIENT_SECRET,
  username: MOLONI_USERNAME,
  password: MOLONI_PASSWORD,
});
const tokenRes = await fetch(`${API}/grant/?${grant}`, { signal: AbortSignal.timeout(30_000) });
const token = await tokenRes.json().catch(() => null);
if (!tokenRes.ok || !token?.access_token) {
  console.error(`Autenticação falhou (HTTP ${tokenRes.status}):`, token?.error_description ?? token?.error ?? token);
  process.exit(1);
}
console.log(`Autenticação OK (token válido ${token.expires_in} s)\n`);

async function call(endpoint, data = {}) {
  const res = await fetch(`${API}/${endpoint}/?access_token=${token.access_token}&json=true`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(30_000),
  });
  return res.json();
}

// 2) Empresas
const companies = await call("companies/getAll");
console.log("EMPRESAS (MOLONI_COMPANY_ID):");
for (const c of companies) console.log(`  ${c.company_id}  ${c.name}  NIF ${c.vat}`);

const companyId = Number(process.argv[2] ?? (companies.length === 1 ? companies[0].company_id : NaN));
if (!companyId) {
  console.log("\nVárias empresas: volte a correr com o company_id escolhido como argumento.");
  process.exit(0);
}
console.log(`\nA usar a empresa ${companyId}\n`);

// 3) Séries de documentos, taxas e unidades dessa empresa
const sets = await call("documentSets/getAll", { company_id: companyId });
console.log("SÉRIES DE DOCUMENTOS (MOLONI_DOCUMENT_SET_ID):");
for (const s of sets) console.log(`  ${s.document_set_id}  ${s.name}${s.active_by_default ? "  (predefinida)" : ""}`);

const taxes = await call("taxes/getAll", { company_id: companyId });
console.log("\nTAXAS (MOLONI_TAX_ID):");
for (const t of taxes) console.log(`  ${t.tax_id}  ${t.name}  ${t.value}%  ${t.fiscal_zone ?? ""}${t.active_by_default ? "  (predefinida)" : ""}`);

const units = await call("measurementUnits/getAll", { company_id: companyId });
console.log("\nUNIDADES (MOLONI_UNIT_ID):");
for (const u of units) console.log(`  ${u.unit_id}  ${u.name} (${u.short_name})`);
