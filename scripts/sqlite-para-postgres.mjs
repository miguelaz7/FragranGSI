// Copia os dados do SQLite antigo (dev.db) para o PostgreSQL do DATABASE_URL.
// Uso (uma vez): node --env-file=.env scripts/sqlite-para-postgres.mjs [ficheiro.db]
// Linhas que já existam (mesma chave) ficam como estão.
import Database from "better-sqlite3";
import pg from "pg";

const sqlite = new Database(process.argv[2] ?? "dev.db", { readonly: true });
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

// Ordem das tabelas: primeiro as que outras referenciam
const TABLES = ["User", "Session", "ProductInfo", "MoloniProduct", "Cart", "CartItem", "Order", "OrderItem", "IntegrationLog"];

// Tipos das colunas no PostgreSQL, para converter booleanos (0/1) e datas (texto)
const { rows: cols } = await client.query(
  "select table_name, column_name, data_type from information_schema.columns where table_schema = 'public'",
);
const typeOf = (table, column) => cols.find((r) => r.table_name === table && r.column_name === column)?.data_type;

await client.query("BEGIN");
try {
  const skipped = [];
  for (const table of TABLES) {
    const rows = sqlite.prepare(`select * from "${table}"`).all();
    let copied = 0;
    let repeated = 0;
    for (const row of rows) {
      const names = Object.keys(row);
      const values = names.map((column) => {
        const value = row[column];
        if (value == null) return value;
        const type = typeOf(table, column);
        if (type === "boolean") return value === 1;
        if (type?.startsWith("timestamp")) return new Date(value);
        return value;
      });
      // Cada linha num savepoint: uma linha que não encaixa (ex.: encomenda de um
      // cliente que já existia com outro id) é saltada sem desfazer as outras
      await client.query("SAVEPOINT linha");
      try {
        const res = await client.query(
          `insert into "${table}" (${names.map((c) => `"${c}"`).join(",")}) values (${names.map((_, i) => `$${i + 1}`).join(",")}) on conflict do nothing`,
          values,
        );
        if (res.rowCount) copied++;
        else repeated++;
      } catch (err) {
        await client.query("ROLLBACK TO SAVEPOINT linha");
        skipped.push(`${table} ${row.id ?? row.sapProduct ?? ""}: ${err.message}`);
      }
    }
    console.log(`${table}: ${copied} copiadas, ${repeated} já existiam`);
  }
  if (skipped.length) console.log(`\nSaltadas (${skipped.length}):\n${skipped.slice(0, 30).join("\n")}`);
  // O id das encomendas é autoincrement: continuar a seguir ao maior copiado
  await client.query(`select setval(pg_get_serial_sequence('"Order"', 'id'), coalesce((select max(id) from "Order"), 0) + 1, false)`);
  await client.query("COMMIT");
} catch (err) {
  await client.query("ROLLBACK");
  throw err;
} finally {
  await client.end();
}
