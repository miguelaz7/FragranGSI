// Passos para criar/completar um perfume no SAP à mão. A criação por API já
// funciona (ver CLAUDE.md), mas ainda não está ligada ao backoffice.
export function SapSteps({ sapProduct, missing }: { sapProduct: string; missing: { material: boolean; price: boolean; stock: boolean } }) {
  const plant = process.env.SAP_PLANT ?? "HD00";
  const salesOrg = process.env.SAP_SALES_ORG ?? "DS00";
  const channel = process.env.SAP_DISTRIBUTION_CHANNEL ?? "WH";

  const steps = [
    missing.material && {
      title: "Criar o material",
      text: `App "Criar material" (MM01): material ${sapProduct}, tipo HAWA, copiar de OHMT1000. Níveis: centro ${plant}, depósito TG00, org. vendas ${salesOrg}, canal ${channel}. Descrição = nome do perfume na loja.`,
    },
    missing.stock && {
      title: "Lançar stock",
      text: `App "Manage Stock": material ${sapProduct}, centro ${plant} → Add Storage Location TG00 → Initial Entry of Stock.`,
    },
    missing.price && {
      title: "Criar o preço de venda",
      text: `App "Manage Prices - Sales": condição PR00, tabela 304 (Sales org./Distr. Chl/Product), ${salesOrg} / ${channel}, material ${sapProduct}, valor em EUR, Release Status = Released.`,
    },
  ].filter(Boolean) as { title: string; text: string }[];

  if (steps.length === 0) return null;
  return (
    <section className="flex flex-col gap-3 border border-[#E8D9B5] bg-[#FBF6EA] p-[22px]">
      <h2 className="text-base font-bold">Falta fazer no SAP</h2>
      <ol className="flex flex-col gap-3 text-sm">
        {steps.map((s, i) => (
          <li key={s.title} className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-admin-text text-xs font-bold text-white">{i + 1}</span>
            <span><strong>{s.title}.</strong> {s.text}</span>
          </li>
        ))}
      </ol>
      <span className="text-xs text-admin-muted">
        Depois de gravar no SAP, use «Sincronizar com o SAP» na lista de produtos. O stock pode demorar alguns minutos a aparecer.
      </span>
    </section>
  );
}
