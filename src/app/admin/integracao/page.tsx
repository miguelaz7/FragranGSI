import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { tokenStatus } from "@/lib/integration/moloni";
import { formatDuration, formatLogTime, timeAgo } from "@/lib/format";
import type { IntegrationLog } from "@/generated/prisma/client";
import { canRetry, markResolved, retryLog, syncCatalogNow, testMoloni, testSap } from "./actions";

export const metadata: Metadata = { title: "Integração" };

// Cores dos estados (iguais ao mockup AdminIntegracao)
const STATUS_STYLE: Record<string, string> = {
  OK: "bg-[#DDF0E4] text-[#14532D]",
  Erro: "bg-[#F9DEDC] text-[#8C1D18]",
  Resolvido: "bg-[#DCE8F7] text-[#163E6C]",
};

const FILTERS = [
  { value: "todos", label: "Todos" },
  { value: "erros", label: "Erros" },
  { value: "sap", label: "SAP" },
  { value: "moloni", label: "Moloni" },
];

const card = "flex flex-col gap-3 border border-admin-line bg-admin-card p-[22px]";
const smallButton = "h-9 border border-[#D4D0C8] bg-admin-card px-4 text-[13px] font-semibold hover:border-admin-text";

export default function IntegracaoPage({ searchParams }: PageProps<"/admin/integracao">) {
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-[28px] font-bold">Monitor de integração</h1>
        <span className="text-sm text-admin-muted">Cada chamada da loja ao SAP e ao Moloni fica registada aqui.</span>
      </div>
      <Suspense fallback={<p className="text-sm text-admin-muted">A carregar registos…</p>}>
        <Monitor searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Monitor({ searchParams }: { searchParams: PageProps<"/admin/integracao">["searchParams"] }) {
  await connection();
  const sp = await searchParams;
  const filter = typeof sp.filtro === "string" ? sp.filtro : "todos";
  const selectedId = typeof sp.id === "string" ? sp.id : null;

  const where =
    filter === "erros" ? { status: "Erro" } : filter === "sap" ? { system: "SAP" } : filter === "moloni" ? { system: "Moloni" } : {};

  const [logs, errorCount, lastSap, lastMoloni] = await Promise.all([
    db.integrationLog.findMany({ where, orderBy: { createdAt: "desc" }, take: 100 }),
    db.integrationLog.count({ where: { status: "Erro" } }),
    db.integrationLog.findFirst({ where: { system: "SAP" }, orderBy: { createdAt: "desc" } }),
    db.integrationLog.findFirst({ where: { system: "Moloni" }, orderBy: { createdAt: "desc" } }),
  ]);
  const selected = (selectedId && (await db.integrationLog.findUnique({ where: { id: selectedId } }))) || logs[0] || null;
  const now = new Date();
  const token = tokenStatus();
  const index = selected ? logs.findIndex((l) => l.id === selected.id) : -1;
  const neighbour = (step: number) => {
    const l = index >= 0 ? logs[index + step] : undefined;
    return l ? href({ id: l.id }) : null;
  };

  const href = (params: { filtro?: string; id?: string }) => {
    const q = new URLSearchParams();
    const f = params.filtro ?? filter;
    if (f !== "todos") q.set("filtro", f);
    if (params.id) q.set("id", params.id);
    const s = q.toString();
    return `/admin/integracao${s ? `?${s}` : ""}`;
  };

  return (
    <>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
        <div className={card}>
          <SystemHeader name="SAP S/4HANA" log={lastSap} />
          <span className="text-[13px] text-admin-muted">OData v2 · produtos, stock e preços</span>
          <span className="text-[13px] text-admin-muted">
            {lastSap ? `Última chamada ${timeAgo(lastSap.createdAt, now)}` : "Ainda sem chamadas registadas"}
          </span>
          <div className="flex flex-wrap gap-2">
            <form action={syncCatalogNow}><button type="submit" className={smallButton}>Sincronizar catálogo</button></form>
            <form action={testSap}><button type="submit" className={smallButton}>Testar ligação</button></form>
          </div>
        </div>
        <div className={card}>
          <SystemHeader name="Moloni" log={lastMoloni} />
          <span className="text-[13px] text-admin-muted">API REST · OAuth2</span>
          <span className="text-[13px] text-admin-muted">
            {token && token.expiresInMs > 0
              ? `Token válido · renova-se automaticamente daqui a ${Math.round(token.expiresInMs / 60000)} min`
              : "Sem token ativo (é pedido na próxima chamada)"}
          </span>
          <div><form action={testMoloni}><button type="submit" className={smallButton}>Testar ligação</button></form></div>
        </div>
      </div>

      <nav aria-label="Filtrar registos" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const on = f.value === filter;
          return (
            <Link
              key={f.value}
              href={href({ filtro: f.value })}
              aria-current={on ? "page" : undefined}
              className={`flex h-9 items-center border px-4 text-[13px] font-semibold ${on ? "border-admin-text bg-admin-text text-white" : "border-[#D4D0C8] bg-admin-card"}`}
            >
              {f.value === "erros" ? `Erros (${errorCount})` : f.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex flex-wrap items-start gap-4">
        <section aria-label="Registo de chamadas" className="min-w-0 flex-[999_1_560px] overflow-x-auto border border-admin-line bg-admin-card">
          {logs.length === 0 ? (
            <p className="p-6 text-sm text-admin-muted">Sem registos para este filtro.</p>
          ) : (
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs text-admin-muted">
                <tr className="border-b border-admin-line">
                  {["Hora", "Sistema", "Operação", "Referência", "Estado", "Tempo"].map((h) => (
                    <th key={h} className="px-4 py-2.5 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => {
                  const on = l.id === selected?.id;
                  return (
                    // "relative" + o link da 1.ª célula esticado (after:inset-0) = a linha toda é clicável
                    <tr key={l.id} className={`relative cursor-pointer border-b border-admin-line last:border-0 ${on ? "bg-[#F3EEE3]" : "hover:bg-admin-bg"}`}>
                      <td className="px-4 py-2.5 tabular-nums">
                        <Link
                          href={href({ id: l.id })}
                          scroll={false}
                          aria-current={on ? "true" : undefined}
                          aria-label={`${formatLogTime(l.createdAt, now)}, ${l.system}, ${l.operation}, ${l.status}`}
                          className="block text-admin-text after:absolute after:inset-0 after:content-['']"
                        >
                          {formatLogTime(l.createdAt, now)}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 font-semibold">{l.system}</td>
                      <td className="max-w-[280px] truncate px-4 py-2.5" title={l.operation}>{l.operation}</td>
                      <td className="px-4 py-2.5">{l.reference ?? "—"}</td>
                      <td className="px-4 py-2.5">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[l.status] ?? ""}`}>{l.status}</span>
                      </td>
                      <td className="px-4 py-2.5 tabular-nums text-admin-muted">{formatDuration(l.durationMs)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        {selected && (
          <LogDetail
            log={selected}
            // Navegação no detalhe: registo mais recente / mais antigo dentro do filtro atual
            newer={neighbour(-1)}
            older={neighbour(1)}
          />
        )}
      </div>
    </>
  );
}

async function LogDetail({ log, newer, older }: { log: IntegrationLog; newer: string | null; older: string | null }) {
  const retryable = log.status === "Erro" && (await canRetry(log.retryAction));
  return (
    // sticky: o detalhe fica visível enquanto se percorre a lista
    <aside aria-label="Detalhe do registo" className={`${card} sticky top-4 max-h-[calc(100vh-2rem)] min-w-0 flex-[1_1_320px] overflow-y-auto`}>
      <nav aria-label="Navegar nos registos" className="flex justify-between gap-2 text-[13px] font-semibold">
        {newer ? <Link href={newer} scroll={false} className="hover:underline">← Mais recente</Link> : <span className="text-admin-muted">← Mais recente</span>}
        {older ? <Link href={older} scroll={false} className="hover:underline">Mais antigo →</Link> : <span className="text-admin-muted">Mais antigo →</span>}
      </nav>
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-base font-bold">{log.system} · {log.reference ?? "—"}</h2>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[log.status] ?? ""}`}>{log.status}</span>
      </div>
      <span className="break-all text-[13px] text-admin-muted">{log.operation}</span>
      {log.message && <p className="text-sm leading-relaxed whitespace-pre-line">{log.message}</p>}
      <span className="text-xs font-semibold uppercase tracking-wide text-admin-muted">Resposta</span>
      <pre className="max-h-80 overflow-auto bg-admin-bg p-3 text-xs leading-relaxed whitespace-pre-wrap break-all">
        {log.response || "(sem corpo de resposta)"}
      </pre>
      {log.status === "Erro" && (
        <div className="flex flex-wrap gap-2">
          {retryable && (
            <form action={retryLog}>
              <input type="hidden" name="id" value={log.id} />
              <button type="submit" className="h-10 bg-admin-text px-5 text-sm font-semibold text-white hover:bg-black">
                Tentar novamente
              </button>
            </form>
          )}
          {/* Para erros já corrigidos por fora (ex.: .env) ou que não interessa repetir */}
          <form action={markResolved}>
            <input type="hidden" name="id" value={log.id} />
            <button type="submit" className="h-10 border border-[#D4D0C8] bg-admin-card px-5 text-sm font-semibold hover:border-admin-text">
              Marcar como resolvido
            </button>
          </form>
        </div>
      )}
    </aside>
  );
}

function SystemHeader({ name, log }: { name: string; log: IntegrationLog | null }) {
  const state = !log ? ["bg-admin-muted", "Sem dados"] : log.status === "Erro" ? ["bg-erro", "Com erro"] : ["bg-sucesso", "Ligado"];
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-base font-bold">{name}</span>
      <span className="flex items-center gap-2 text-[13px] text-admin-muted">
        <span className={`size-2 rounded-full ${state[0]}`} aria-hidden />
        {state[1]}
      </span>
    </div>
  );
}
