"use client";

import Form from "next/form";

// Formulário dos filtros do catálogo. O <Form> do Next faz a pesquisa GET com
// navegação do lado do cliente (sem recarregar a página). Caixas e ordenação
// aplicam-se logo ao mudar; a pesquisa de texto aplica-se com Enter.
// Sem JavaScript continua a funcionar com o botão "Aplicar filtros".
export function FilterForm({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <Form
      action="/catalogo"
      className={className}
      onChange={(e) => {
        const el = e.target;
        const isCheckbox = el instanceof HTMLInputElement && el.type === "checkbox";
        if (isCheckbox || el instanceof HTMLSelectElement) e.currentTarget.requestSubmit();
      }}
    >
      {children}
    </Form>
  );
}
