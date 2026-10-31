import Link from "next/link";

// Mostrada quando o nº de material não existe no catálogo SAP
export default function ProdutoNaoEncontrado() {
  return (
    <div className="flex flex-col items-start gap-5 py-24">
      <h1 className="font-serif text-4xl">Perfume não encontrado</h1>
      <p className="text-loja-muted">Este perfume não existe ou deixou de estar disponível na loja.</p>
      <Link href="/catalogo" className="text-ouro hover:underline">Ver todos os perfumes →</Link>
    </div>
  );
}
