// Alternativa manual quando a criação do material no SAP falhou e "Tentar novamente"
// também não resolve. O preço e o stock gravam-se nesta página assim que o material existir.
export function SapSteps({ sapProduct, missing }: { sapProduct: string; missing: { material: boolean } }) {
  if (!missing.material) return null;

  const plant = process.env.SAP_PLANT ?? "HD00";
  const salesOrg = process.env.SAP_SALES_ORG ?? "DS00";
  const channel = process.env.SAP_DISTRIBUTION_CHANNEL ?? "WH";

  return (
    <section className="flex flex-col gap-3 border border-[#E8D9B5] bg-[#FBF6EA] p-[22px]">
      <h2 className="text-base font-bold">Falta o material no SAP</h2>
      <p className="text-sm">
        Repita a criação no <a href="/admin/integracao?filtro=erros" className="underline">monitor de integração</a> ou crie-o à mão
        na app «Criar material» (MM01): material {sapProduct}, tipo HAWA, copiar de OHMT1000. Níveis: centro {plant}, depósito
        TG00, org. vendas {salesOrg}, canal {channel}. Descrição = nome do perfume na loja.
      </p>
      <span className="text-xs text-admin-muted">
        Depois de criado, use «Sincronizar com o SAP» na lista de produtos; o preço e o stock gravam-se nesta página.
      </span>
    </section>
  );
}
