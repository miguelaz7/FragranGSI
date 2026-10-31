import "server-only";
import { db } from "@/lib/db";

// Dados de DEMONSTRAÇÃO para o dashboard e o Analista IA enquanto não há vendas
// reais. Tudo fica marcado com isDemo = true e sai com clearDemoData().
// Os perfumes são o PERF001-093 (real) e os planeados do design; os preços dos
// planeados são inventados só para a demo.

const PRODUCTS = [
  { code: "PERF001-093", name: "Âmbar Amadeirado", price: 89, weight: 6 },
  { code: "PERF002-093", name: "Flor de Laranjeira", price: 64, weight: 5 },
  { code: "PERF003-093", name: "Cedro Atlântico", price: 72, weight: 4 },
  { code: "PERF004-093", name: "Figo Verde", price: 68, weight: 3 },
  { code: "PERF005-093", name: "Rosa Noturna", price: 79, weight: 4 },
  { code: "PERF006-093", name: "Limão do Algarve", price: 55, weight: 3 },
  { code: "PERF007-093", name: "Couro & Tabaco", price: 95, weight: 2 },
  { code: "PERF008-093", name: "Brisa Salgada", price: 62, weight: 5 },
  { code: "PERF009-093", name: "Íris Pó", price: 81, weight: 2 },
  { code: "PERF010-093", name: "Chá Verde & Mate", price: 58, weight: 2 },
  { code: "PERF011-093", name: "Oud Imperial", price: 118, weight: 1 },
];

// Tendências na última semana (multiplicador do peso), para o analista detetar
const LAST_WEEK_TREND: Record<string, number> = { "PERF011-093": 5, "PERF007-093": 3, "PERF008-093": 0.3 };

const FIRST = ["Ana", "Beatriz", "Carla", "Daniela", "Inês", "Joana", "Marta", "Sofia", "Rita", "Teresa", "André", "Bruno", "Diogo", "Gonçalo", "João", "Miguel", "Pedro", "Rui", "Tiago", "Vasco"];
const LAST = ["Almeida", "Costa", "Ferreira", "Gomes", "Lopes", "Martins", "Oliveira", "Pereira", "Rodrigues", "Santos", "Silva", "Sousa"];
const CITIES = ["Braga", "Porto", "Guimarães", "Lisboa", "Coimbra", "Aveiro", "Viana do Castelo", "Faro"];

const DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;

// Gerador pseudo-aleatório com semente fixa: os dados saem sempre iguais
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function hasDemoData() {
  return (await db.order.count({ where: { isDemo: true } })) > 0;
}

export async function clearDemoData() {
  // As linhas das encomendas apagam-se em cascata
  await db.$transaction([db.order.deleteMany({ where: { isDemo: true } }), db.user.deleteMany({ where: { isDemo: true } })]);
}

export async function generateDemoData(now = new Date()) {
  await clearDemoData();
  const rand = rng(2026);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];

  // 40 clientes fictícios (emails @example.com, domínio reservado)
  const users = [];
  for (let i = 1; i <= 40; i++) {
    users.push(
      await db.user.create({
        data: {
          email: `cliente.demo.${i}@example.com`,
          passwordHash: "",
          name: `${pick(FIRST)} ${pick(LAST)}`,
          city: pick(CITIES),
          isDemo: true,
          createdAt: new Date(now.getTime() - (DAYS + 30 - i) * DAY),
        },
      }),
    );
  }
  // Uns poucos clientes compram mais vezes
  const regulars = users.slice(0, 8);

  let docNo = 1;
  for (let d = DAYS - 1; d >= 0; d--) {
    const day = new Date(now.getTime() - d * DAY);
    const weekend = [0, 6].includes(day.getDay());
    // Volume a crescer ligeiramente ao longo do mês, mais ao fim de semana
    const count = Math.round((weekend ? 5 : 3) * (0.8 + (0.4 * (DAYS - d)) / DAYS) + (rand() - 0.5) * 2);

    for (let n = 0; n < Math.max(count, 0); n++) {
      const createdAt = new Date(day);
      createdAt.setHours(9 + Math.floor(rand() * 14), Math.floor(rand() * 60), 0, 0);
      if (createdAt > now) continue;

      // Escolha do perfume ponderada (com a tendência da última semana)
      const weights = PRODUCTS.map((p) => p.weight * (d < 7 ? (LAST_WEEK_TREND[p.code] ?? 1) : 1));
      const total = weights.reduce((a, b) => a + b, 0);
      const choose = () => {
        let r = rand() * total;
        return PRODUCTS[weights.findIndex((w) => (r -= w) < 0)] ?? PRODUCTS[0];
      };

      const lines = [choose()];
      if (rand() < 0.2) lines.push(choose());
      const items = lines.map((p) => ({ sapProduct: p.code, name: p.name, quantity: rand() < 0.12 ? 2 : 1, unitPrice: p.price }));
      const orderTotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);

      const ageDays = (now.getTime() - createdAt.getTime()) / DAY;
      const failed = d < 4 && rand() < 0.06; // algumas faturas recentes com erro
      await db.order.create({
        data: {
          userId: (rand() < 0.35 ? pick(regulars) : pick(users)).id,
          status: ageDays > 5 ? "Entregue" : ageDays > 2 ? "Enviada" : "Pendente",
          invoiceStatus: failed ? "erro" : "emitida",
          moloniDocumentNo: failed ? null : `FR DEMO/${docNo++}`,
          total: orderTotal,
          isDemo: true,
          createdAt,
          items: { create: items },
        },
      });
    }
  }
}
