import "server-only";
import { db } from "@/lib/db";
import { getCatalog } from "@/lib/catalog";
import { dayKey } from "@/lib/format";

// Resumo dos dados da loja que o Analista IA recebe. Só números agregados:
// nenhum nome, email ou morada de cliente sai daqui para a IA.

const DAY = 24 * 60 * 60 * 1000;
const WEEKDAYS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const round2 = (n: number) => Math.round(n * 100) / 100;

export async function buildSnapshot(now = new Date()) {
  const since60 = new Date(now.getTime() - 60 * DAY);
  const t7 = now.getTime() - 7 * DAY;
  const t14 = now.getTime() - 14 * DAY;
  const t30 = now.getTime() - 30 * DAY;

  const [orders, customers, demoOrders, carts, logs, infos] = await Promise.all([
    db.order.findMany({ where: { createdAt: { gte: since60 } }, include: { items: true } }),
    db.user.findMany({ where: { role: "customer" }, select: { id: true, createdAt: true } }),
    db.order.count({ where: { isDemo: true } }),
    db.cart.findMany({ where: { items: { some: {} } }, include: { items: true } }),
    db.integrationLog.findMany({ where: { createdAt: { gte: new Date(t7) } }, select: { system: true, status: true, durationMs: true } }),
    db.productInfo.findMany(),
  ]);

  let catalog: Awaited<ReturnType<typeof getCatalog>> | null = null;
  try {
    catalog = await getCatalog();
  } catch {}

  const inRange = (o: { createdAt: Date }, from: number, to = now.getTime()) => o.createdAt.getTime() >= from && o.createdAt.getTime() < to;
  const sum = (list: typeof orders) => ({
    encomendas: list.length,
    unidades: list.reduce((s, o) => s + o.items.reduce((a, i) => a + i.quantity, 0), 0),
    receita: round2(list.reduce((s, o) => s + o.total, 0)),
    ticketMedio: list.length ? round2(list.reduce((s, o) => s + o.total, 0) / list.length) : 0,
  });

  const last7 = orders.filter((o) => inRange(o, t7));
  const prev7 = orders.filter((o) => inRange(o, t14, t7));
  const last30 = orders.filter((o) => inRange(o, t30));

  // Vendas por dia (30 dias, hora de Lisboa)
  const byDay = new Map<string, typeof orders>();
  for (const o of last30) byDay.set(dayKey(o.createdAt), [...(byDay.get(dayKey(o.createdAt)) ?? []), o]);
  const vendasPorDia = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(now.getTime() - (29 - i) * DAY);
    return { dia: dayKey(d), diaSemana: WEEKDAYS[d.getDay()], ...sum(byDay.get(dayKey(d)) ?? []) };
  });

  // Por perfume: últimos 7 dias, 7 dias anteriores e 30 dias
  const infoBy = new Map(infos.map((i) => [i.sapProduct, i]));
  const perfume = new Map<string, { nome: string; u7: number; r7: number; uPrev7: number; u30: number; r30: number }>();
  for (const o of orders) {
    for (const i of o.items) {
      const p = perfume.get(i.sapProduct) ?? { nome: i.name, u7: 0, r7: 0, uPrev7: 0, u30: 0, r30: 0 };
      const value = i.quantity * i.unitPrice;
      if (inRange(o, t7)) { p.u7 += i.quantity; p.r7 += value; }
      if (inRange(o, t14, t7)) p.uPrev7 += i.quantity;
      if (inRange(o, t30)) { p.u30 += i.quantity; p.r30 += value; }
      perfume.set(i.sapProduct, p);
    }
  }
  const porPerfume = [...perfume.entries()]
    .map(([codigo, p]) => ({
      codigo,
      nome: p.nome,
      familia: infoBy.get(codigo)?.family ?? null,
      genero: infoBy.get(codigo)?.gender ?? null,
      unidades7d: p.u7,
      receita7d: round2(p.r7),
      unidades7dAnteriores: p.uPrev7,
      variacaoUnidadesPct: p.uPrev7 ? Math.round(((p.u7 - p.uPrev7) / p.uPrev7) * 100) : null,
      unidades30d: p.u30,
      receita30d: round2(p.r30),
    }))
    .sort((a, b) => b.unidades7d - a.unidades7d || b.unidades30d - a.unidades30d);

  // Receita por dia da semana (30 dias)
  const porDiaSemana = WEEKDAYS.map((nome, idx) => ({
    dia: nome,
    receita: round2(last30.filter((o) => o.createdAt.getDay() === idx).reduce((s, o) => s + o.total, 0)),
  }));

  // Clientes (agregado, sem dados pessoais)
  const buyers30 = new Map<string, number>();
  for (const o of last30) buyers30.set(o.userId, (buyers30.get(o.userId) ?? 0) + 1);

  const integracao = ["SAP", "Moloni", "IA"].map((sistema) => {
    const l = logs.filter((x) => x.system === sistema);
    return {
      sistema,
      chamadas7d: l.length,
      erros7d: l.filter((x) => x.status !== "OK").length,
      porResolver: l.filter((x) => x.status === "Erro").length,
      tempoMedioMs: l.length ? Math.round(l.reduce((s, x) => s + x.durationMs, 0) / l.length) : 0,
    };
  });

  const abandonedAfter = now.getTime() - DAY;
  return {
    geradoEm: now.toISOString(),
    moeda: "EUR",
    avisoDados: demoOrders > 0
      ? `ATENÇÃO: ${demoOrders} encomendas são DADOS DE DEMONSTRAÇÃO (fictícios). Os perfumes PERF002-093 a PERF011-093 ainda não existem no SAP.`
      : null,
    resumo: {
      ultimos7dias: sum(last7),
      semanaAnterior: sum(prev7),
      ultimos30dias: sum(last30),
    },
    vendasPorDia,
    porPerfume,
    porDiaSemana,
    encomendas: {
      porEstado: ["Pendente", "Enviada", "Entregue"].map((e) => ({ estado: e, total: orders.filter((o) => o.status === e).length })),
      faturasComErro: orders.filter((o) => o.invoiceStatus === "erro").length,
    },
    clientes: {
      total: customers.length,
      novosUltimos7dias: customers.filter((c) => c.createdAt.getTime() >= t7).length,
      compraramUltimos30dias: buyers30.size,
      compraramMaisDeUmaVez30dias: [...buyers30.values()].filter((n) => n > 1).length,
    },
    catalogoSAP: catalog
      ? catalog.map((p) => ({ codigo: p.sapProduct, nome: p.name, preco: p.price, stock: p.stock, visivelNaLoja: p.visible }))
      : "indisponível (falha na ligação ao SAP)",
    carrinhos: {
      ativos24h: carts.filter((c) => c.updatedAt.getTime() >= abandonedAfter).length,
      abandonados: carts.filter((c) => c.updatedAt.getTime() < abandonedAfter).length,
      unidadesPorPerfume: Object.entries(
        carts.flatMap((c) => c.items).reduce<Record<string, number>>((acc, i) => ({ ...acc, [i.sapProduct]: (acc[i.sapProduct] ?? 0) + i.quantity }), {}),
      ).map(([codigo, unidades]) => ({ codigo, unidades })),
    },
    integracao,
  };
}
