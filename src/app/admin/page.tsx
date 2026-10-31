import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { getCatalog } from "@/lib/catalog";
import { dayKey, formatDayMonth, formatEur, formatLongDate, timeAgo } from "@/lib/format";
import { SalesChart } from "@/components/admin/SalesChart";

export const metadata: Metadata = { title: "Dashboard" };

const card = "flex flex-col gap-2 border border-admin-line bg-admin-card p-[22px]";
const cardLabel = "text-[13px] text-admin-muted";
const cardValue = "text-[30px] font-bold";

// Cores dos estados de envio (iguais ao mockup)
const statusStyle: Record<string, string> = {
  Pendente: "bg-[#FDF0D5] text-[#6B4500]",
  Enviada: "bg-[#DCE8F7] text-[#163E6C]",
  Entregue: "bg-[#DDF0E4] text-[#14532D]",
};

export default function DashboardPage() {
  // O conteúdo é lido da BD a cada pedido; enquanto chega, mostra-se só o título
  return (
    <Suspense fallback={<h1 className="text-[28px] font-bold">Dashboard</h1>}>
      <Dashboard />
    </Suspense>
  );
}

async function Dashboard() {
  await connection();
  const now = new Date();
  const today = dayKey(now);

  // Encomendas dos últimos 8 dias (7 para o gráfico + ontem para comparar)
  const since = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);
  const [recentOrders, toShip, integrationErrors, latestOrders, lastSap, lastMoloni] = await Promise.all([
    db.order.findMany({ where: { createdAt: { gte: since } }, select: { total: true, createdAt: true, invoiceStatus: true } }),
    db.order.count({ where: { status: "Pendente" } }),
    db.integrationLog.count({ where: { status: "Erro" } }),
    db.order.findMany({ orderBy: { createdAt: "desc" }, take: 5, include: { user: { select: { name: true } } } }),
    db.integrationLog.findFirst({ where: { system: "SAP" }, orderBy: { createdAt: "desc" } }),
    db.integrationLog.findFirst({ where: { system: "Moloni" }, orderBy: { createdAt: "desc" } }),
  ]);

  // Soma das vendas por dia (hora de Lisboa)
  const salesByDay = new Map<string, number>();
  for (const o of recentOrders) {
    const k = dayKey(o.createdAt);
    salesByDay.set(k, (salesByDay.get(k) ?? 0) + o.total);
  }
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(now.getTime() - (6 - i) * 24 * 60 * 60 * 1000);
    return { label: i === 6 ? "Hoje" : formatDayMonth(date), value: salesByDay.get(dayKey(date)) ?? 0 };
  });
  const salesToday = days[6].value;
  const salesYesterday = days[5].value;
  const change = salesYesterday > 0 ? Math.round(((salesToday - salesYesterday) / salesYesterday) * 100) : null;

  const invoicesToday = recentOrders.filter((o) => o.invoiceStatus === "emitida" && dayKey(o.createdAt) === today).length;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-[28px] font-bold">Dashboard</h1>
          <span className="text-sm text-admin-muted">{formatLongDate(now)}</span>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-admin-muted">
          <SystemStatus name="SAP" log={lastSap} now={now} />
          <SystemStatus name="Moloni" log={lastMoloni} now={now} />
        </div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
        <div className={card}>
          <span className={cardLabel}>Vendas hoje</span>
          <span className={cardValue}>{formatEur(salesToday)}</span>
          {change !== null && (
            <span className={`text-[13px] ${change >= 0 ? "text-sucesso" : "text-erro"}`}>
              {change >= 0 ? "▲" : "▼"} {Math.abs(change)}% vs. ontem
            </span>
          )}
        </div>
        <div className={card}>
          <span className={cardLabel}>Encomendas por enviar</span>
          <span className={cardValue}>{toShip}</span>
        </div>
        <div className={card}>
          <span className={cardLabel}>Faturas emitidas hoje</span>
          <span className={cardValue}>{invoicesToday}</span>
          <span className={cardLabel}>via Moloni</span>
        </div>
        <div className={`${card} ${integrationErrors > 0 ? "border-t-[3px] border-t-erro" : ""}`}>
          <span className={cardLabel}>Erros de integração</span>
          <span className={`${cardValue} ${integrationErrors > 0 ? "text-erro" : ""}`}>{integrationErrors}</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        <section aria-labelledby="vendas7" className={`${card} flex-[2_1_420px] gap-5`}>
          <h2 id="vendas7" className="text-base font-bold">Vendas dos últimos 7 dias</h2>
          <SalesChart days={days} />
        </section>
        <section aria-labelledby="stockbaixo" className={`${card} flex-[1_1_280px]`}>
          <h2 id="stockbaixo" className="text-base font-bold">Stock baixo (SAP)</h2>
          {/* Bloco à parte: se o SAP estiver lento, o resto do dashboard não espera */}
          <Suspense fallback={<p className="text-sm text-admin-muted">A ler stock do SAP…</p>}>
            <LowStock />
          </Suspense>
        </section>
      </div>

      <section aria-labelledby="ultimas" className={`${card} gap-4`}>
        <h2 id="ultimas" className="text-base font-bold">Últimas encomendas</h2>
        {latestOrders.length === 0 ? (
          <p className="text-sm text-admin-muted">Ainda não há encomendas.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="text-xs text-admin-muted">
                <tr className="border-b border-admin-line">
                  <th className="py-2 font-medium">Encomenda</th>
                  <th className="py-2 font-medium">Cliente</th>
                  <th className="py-2 font-medium">Total</th>
                  <th className="py-2 font-medium">Estado</th>
                  <th className="py-2 font-medium">Fatura</th>
                </tr>
              </thead>
              <tbody>
                {latestOrders.map((o) => (
                  <tr key={o.id} className="border-b border-admin-line last:border-0">
                    <td className="py-3 font-semibold">#{o.id}</td>
                    <td className="py-3">{o.user.name}</td>
                    <td className="py-3">{formatEur(o.total)}</td>
                    <td className="py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyle[o.status] ?? ""}`}>
                        {o.status}
                      </span>
                    </td>
                    <td className="py-3">
                      {o.invoiceStatus === "erro" ? (
                        <span className="font-bold text-erro">Falhou — rever</span>
                      ) : (
                        (o.moloniDocumentNo ?? "—")
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

// Estado de cada ERP com base na última chamada registada no IntegrationLog
function SystemStatus({ name, log, now }: { name: string; log: { status: string; createdAt: Date } | null; now: Date }) {
  const color = !log ? "bg-admin-muted" : log.status === "Erro" ? "bg-erro" : "bg-sucesso";
  const text = !log
    ? "sem chamadas registadas"
    : `${log.status === "Erro" ? "erro na última chamada" : "ligado"} · ${timeAgo(log.createdAt, now)}`;
  return (
    <span className="flex items-center gap-2">
      <span className={`size-2 rounded-full ${color}`} aria-hidden />
      {name}: {text}
    </span>
  );
}

// Perfumes esgotados ou com poucas unidades, lidos do SAP (via catálogo em cache)
async function LowStock() {
  let catalog;
  try {
    catalog = await getCatalog();
  } catch {
    return <p className="text-sm text-erro">Não foi possível ler o stock do SAP. Ver o registo de integração.</p>;
  }
  const low = catalog.filter((p) => p.stockStatus !== "ok").sort((a, b) => a.stock - b.stock);
  if (low.length === 0) return <p className="text-sm text-admin-muted">Todos os perfumes têm stock suficiente.</p>;
  return (
    <ul className="flex flex-col">
      {low.map((p) => (
        <li key={p.sapProduct} className="flex justify-between gap-4 border-b border-admin-line py-2.5 text-sm last:border-0">
          <span>{p.name}</span>
          <span className={`font-semibold ${p.stock <= 0 ? "text-erro" : "text-[#9A5B00]"}`}>
            {p.stock <= 0 ? "Esgotado" : `${p.stock} un.`}
          </span>
        </li>
      ))}
    </ul>
  );
}
