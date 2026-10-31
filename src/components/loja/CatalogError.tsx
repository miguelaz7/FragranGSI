// Mensagem mostrada ao cliente quando o SAP não responde.
// O detalhe técnico fica no IntegrationLog (backoffice → Integração), não aqui.
export function CatalogError() {
  return (
    <div role="alert" className="border border-loja-line bg-loja-surface p-6 text-loja-muted">
      <p className="font-serif text-xl text-loja-text">Não foi possível carregar os perfumes.</p>
      <p className="mt-2 text-sm">O nosso sistema de stock está temporariamente indisponível. Tente novamente dentro de alguns minutos.</p>
    </div>
  );
}
