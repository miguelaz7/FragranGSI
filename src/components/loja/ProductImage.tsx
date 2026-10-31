// Foto do perfume, ou um frasco desenhado enquanto não há fotografia.
// Usado no cartão do catálogo e na página de produto.
export function ProductImage({ src, large = false }: { src?: string | null; large?: boolean }) {
  return (
    <div className="relative flex aspect-[4/5] items-end justify-center overflow-hidden bg-loja-surface">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="size-full object-cover" />
      ) : (
        <div className={`flex flex-col items-center ${large ? "mb-[16%]" : "mb-[18%]"}`} aria-hidden>
          <div className={`bg-loja-line ${large ? "h-10 w-16" : "h-6 w-10"}`} />
          <div
            className={`border border-loja-line bg-loja-bg/60 transition-colors group-hover:border-ouro/60 ${large ? "h-72 w-48" : "h-40 w-28"}`}
          />
        </div>
      )}
    </div>
  );
}
