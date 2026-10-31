// Links da navegação principal da loja (cabeçalho). Num ficheiro à parte porque
// são usados por um Server Component (Header) e por um Client Component (HeaderNav).
export const NAV_ITEMS = [
  { href: "/catalogo", label: "Perfumes", gender: null },
  { href: "/catalogo?genero=mulher", label: "Mulher", gender: "mulher" },
  { href: "/catalogo?genero=homem", label: "Homem", gender: "homem" },
  { href: "/catalogo?genero=unissexo", label: "Unissexo", gender: "unissexo" },
  { href: "/assistente", label: "Encontrar o meu perfume", gender: null },
] as const;
