import Link from "next/link";
import { db } from "@/lib/db";
import { getCatalog, isInfoComplete, type CatalogProduct } from "@/lib/catalog";
import { formatDuration, formatEur } from "@/lib/format";

// Painéis do dashboard com dados que já existem antes do checkout:
// catálogo/stock (SAP), carrinhos (BD local) e saúde da integração (IntegrationLog).

const card = "flex flex-col gap-4 border border-admin-line bg-admin-card p-[22px]";
const tile = "flex flex-col gap-1 border border-admin-line p-4";

const DAY = 24 * 60 * 60 * 1000;
const ABANDONED_AFTER_MS = DAY; // carrinho sem mexer há mais de 24 h = abandonado

async function catalogOrNull(): Promise<CatalogProduct[] | null> {
  try {
    return await getCatalog();
  } catch {
    return null;
  }
}

function Tile({ label, value, tone, href }: { label: string; value: string | number; tone?: "warn" | "bad"; href?: string }) {
  const color = tone === "bad" ? "text-erro" : tone === "warn" ? "text-[#9A5B00]" : "";
  const body = (
    <>
      <span className="text-[13px] text-admin-muted">{label}</span>
      <span className={`text-2xl font-bold tabular-nums ${color}`}>{value}</span>
    </>
  );
  return href ? <Link href={href} className={`${tile} hover:border-admin-text`}>{body}</Link> : <div className={tile}>{body}</div>;
}

/** Estado do catálogo: o que está à venda, valor do stock e o que precisa de atenção. */
export async function CatalogHealth() {
  const catalog = await catalogOrNull();
  if (!catalog) return <p className="text-sm text-erro">Não foi possível ler o catálogo do SAP. Ver o monitor de integração.</p>;

  const onSale = catalog.filter((p) => p.visible && p.price != null && p.stock > 0).length;
  const stockValue = catalog.reduce((sum, p) => sum + (p.price ?? 0) * Math.max(p.stock, 0), 0);
  const units = catalog.reduce((sum, p) => sum + Math.max(p.stock, 0), 0);
  const noPrice = catalog.filter((p) => p.price == null).length;
  const incomplete = catalog.filter((p) => !isInfoComplete(p.info)).length;
  const soldOut = catalog.filter((p) => p.stock <= 0).length;
  const hidden = catalog.filter((p) => !p.visible).length;

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
      <Tile label="À venda na loja" value={`${onSale} de ${catalog.length}`} href="/admin/produtos" />
      <Tile label="Unidades em stock" value={units} />
      <Tile label="Valor do stock (preço de venda)" value={formatEur(stockValue)} />
      <Tile label="Sem preço PR00" value={noPrice} tone={noPrice ? "bad" : undefined} href="/admin/produtos" />
      <Tile label="Esgotados" value={soldOut} tone={soldOut ? "bad" : undefined} href="/admin/produtos" />
      <Tile label="Ficha por completar" value={incomplete} tone={incomplete ? "warn" : undefined} href="/admin/produtos" />
      <Tile label="Escondidos da loja" value={hidden} href="/admin/produtos" />
    </div>
  );
}

/** Carrinhos com artigos: ativos vs. abandonados, valor potencial e perfumes mais adicionados. */
export async function CartsPanel({ now }: { now: Date }) {
  const [carts, catalog] = await Promise.all([
    db.cart.findMany({ where: { items: { some: {} } }, include: { items: true } }),
    catalogOrNull(),
  ]);
  const priceOf = new Map(catalog?.map((p) => [p.sapProduct, p.price]) ?? []);
  const nameOf = new Map(catalog?.map((p) => [p.sapProduct, p.name]) ?? []);

  const value = (items: { sapProduct: string; quantity: number }[]) =>
    items.reduce((sum, i) => sum + (priceOf.get(i.sapProduct) ?? 0) * i.quantity, 0);

  const idle = (c: { updatedAt: Date }) => now.getTime() - c.updatedAt.getTime();
  const active = carts.filter((c) => idle(c) <= ABANDONED_AFTER_MS);
  const abandoned = carts.filter((c) => idle(c) > ABANDONED_AFTER_MS);

  // Perfumes com mais unidades nos carrinhos
  const qtyBy = new Map<string, number>();
  for (const c of carts) for (const i of c.items) qtyBy.set(i.sapProduct, (qtyBy.get(i.sapProduct) ?? 0) + i.quantity);
  const top = [...qtyBy.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <section aria-labelledby="carrinhos" className={`${card} flex-[1_1_360px]`}>
      <h2 id="carrinhos" className="text-base font-bold">Carrinhos</h2>
      <div className="grid grid-cols-2 gap-3">
        <Tile label="Ativos (últimas 24 h)" value={active.length} />
        <Tile label="Valor nos ativos" value={catalog ? formatEur(value(active.flatMap((c) => c.items))) : "—"} />
        <Tile label="Abandonados" value={abandoned.length} tone={abandoned.length ? "warn" : undefined} />
        <Tile label="Valor nos abandonados" value={catalog ? formatEur(value(abandoned.flatMap((c) => c.items))) : "—"} />
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-semibold">Mais adicionados ao carrinho</span>
        {top.length === 0 ? (
          <span className="text-sm text-admin-muted">Ainda não há carrinhos com artigos.</span>
        ) : (
          <ul className="flex flex-col">
            {top.map(([code, qty]) => (
              <li key={code} className="flex justify-between gap-4 border-b border-admin-line py-2 text-sm last:border-0">
                <span>{nameOf.get(code) ?? code}</span>
                <span className="font-semibold tabular-nums">{qty} un.</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <span className="text-xs text-admin-muted">Abandonado = sem alterações há mais de 24 h. Valores com os preços atuais do SAP.</span>
    </section>
  );
}

/** Chamadas, erros e tempos de resposta do SAP e do Moloni nos últimos 7 dias. */
export async function IntegrationHealth({ now }: { now: Date }) {
  const since = new Date(now.getTime() - 7 * DAY);
  const where = { createdAt: { gte: since } };
  const [stats, failed, pending] = await Promise.all([
    db.integrationLog.groupBy({ by: ["system"], where, _count: { _all: true }, _avg: { durationMs: true }, _max: { durationMs: true } }),
    // "Resolvido" também conta: foi um erro, repetido depois com sucesso
    db.integrationLog.groupBy({ by: ["system"], where: { ...where, status: { in: ["Erro", "Resolvido"] } }, _count: { _all: true } }),
    db.integrationLog.groupBy({ by: ["system"], where: { ...where, status: "Erro" }, _count: { _all: true } }),
  ]);
  const failedBy = new Map(failed.map((f) => [f.system, f._count._all]));
  const pendingBy = new Map(pending.map((f) => [f.system, f._count._all]));

  return (
    <section aria-labelledby="saude" className={`${card} flex-[1_1_360px]`}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="saude" className="text-base font-bold">Saúde da integração <span className="font-normal text-admin-muted">(7 dias)</span></h2>
        <Link href="/admin/integracao" className="text-[13px] underline">Ver registo</Link>
      </div>
      {stats.length === 0 ? (
        <span className="text-sm text-admin-muted">Sem chamadas nos últimos 7 dias.</span>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-admin-muted">
            <tr className="border-b border-admin-line">
              <th className="py-2 font-medium">Sistema</th>
              <th className="py-2 text-right font-medium">Chamadas</th>
              <th className="py-2 text-right font-medium">Taxa de erro</th>
              <th className="py-2 text-right font-medium">Por resolver</th>
              <th className="py-2 text-right font-medium">Tempo médio</th>
              <th className="py-2 text-right font-medium">Máximo</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s) => {
              const total = s._count._all;
              const errors = failedBy.get(s.system) ?? 0;
              const open = pendingBy.get(s.system) ?? 0;
              const rate = total ? Math.round((errors / total) * 100) : 0;
              return (
                <tr key={s.system} className="border-b border-admin-line last:border-0">
                  <td className="py-2.5 font-semibold">{s.system}</td>
                  <td className="py-2.5 text-right tabular-nums">{total}</td>
                  <td className={`py-2.5 text-right tabular-nums ${rate > 10 ? "font-semibold text-erro" : ""}`}>{rate}%</td>
                  <td className={`py-2.5 text-right tabular-nums ${open ? "font-semibold text-erro" : ""}`}>{open}</td>
                  <td className="py-2.5 text-right tabular-nums">{formatDuration(Math.round(s._avg.durationMs ?? 0))}</td>
                  <td className="py-2.5 text-right tabular-nums">{formatDuration(s._max.durationMs ?? 0)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
