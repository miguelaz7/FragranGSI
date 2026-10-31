import { connection } from "next/server";
import { db } from "@/lib/db";
import { createDemoData, removeDemoData } from "@/app/admin/demo-actions";

// Aviso + botões dos dados de demonstração. Mostrado no dashboard e no analista,
// para nunca se confundir números fictícios com vendas reais.
export async function DemoDataNotice({ offerCreate = false }: { offerCreate?: boolean }) {
  await connection();
  const [demo, real] = await Promise.all([
    db.order.count({ where: { isDemo: true } }),
    db.order.count({ where: { isDemo: false } }),
  ]);

  if (demo > 0) {
    return (
      <div role="status" className="flex flex-wrap items-center justify-between gap-3 border border-[#E8D9B5] bg-[#FBF6EA] px-4 py-3 text-sm">
        <span>
          <strong>Dados de demonstração:</strong> {demo} encomendas fictícias estão incluídas nos números
          {real > 0 ? ` (e ${real} reais)` : ""}.
        </span>
        <form action={removeDemoData}>
          <button type="submit" className="h-9 border border-[#C9A96E] px-4 text-[13px] font-semibold hover:bg-white">Apagar dados de demonstração</button>
        </form>
      </div>
    );
  }

  if (offerCreate && real === 0) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 border border-admin-line bg-admin-card px-4 py-3 text-sm">
        <span className="text-admin-muted">Ainda não há vendas. Para experimentar o dashboard e o analista, pode gerar 30 dias de encomendas fictícias.</span>
        <form action={createDemoData}>
          <button type="submit" className="h-9 bg-admin-text px-4 text-[13px] font-semibold text-white hover:bg-black">Gerar dados de demonstração</button>
        </form>
      </div>
    );
  }
  return null;
}
