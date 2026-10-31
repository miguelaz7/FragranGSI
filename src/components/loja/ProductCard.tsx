import Link from "next/link";
import { formatEur } from "@/lib/format";
import { stockLabel, type CatalogProduct } from "@/lib/catalog";
import { ProductImage } from "./ProductImage";

export const stockColor = { ok: "text-stock-ok", low: "text-stock-low", out: "text-loja-muted" };

// Cartão de produto: nome, preço e stock vêm do SAP; família, concentração,
// tamanho e foto vêm da BD local (podem faltar se o perfume ainda não foi enriquecido).
export function ProductCard({ product }: { product: CatalogProduct }) {
  const { info } = product;
  return (
    <Link href={`/produto/${encodeURIComponent(product.sapProduct)}`} className="group flex flex-col gap-4">
      <ProductImage src={info?.imageUrl} />
      <div className="flex flex-col gap-1">
        {info && <span className="text-xs uppercase tracking-[0.18em] text-ouro">{info.family}</span>}
        <span className="font-serif text-xl group-hover:text-ouro">{product.name}</span>
        {info && (
          <span className="text-sm text-loja-muted">
            {info.concentration} · {info.sizeMl} ml
          </span>
        )}
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[15px] font-semibold">
          {product.price !== null ? formatEur(product.price) : <span className="font-normal text-loja-muted">Preço indisponível</span>}
        </span>
        <span className={`text-xs ${stockColor[product.stockStatus]}`}>
          {product.stockStatus === "out" ? "○" : "●"} {stockLabel[product.stockStatus]}
        </span>
      </div>
    </Link>
  );
}
