import { Logo } from "./Header";

export function Footer() {
  return (
    <footer className="mt-24 flex flex-wrap items-center justify-between gap-4 border-t border-loja-line px-4 py-8 text-sm text-loja-muted sm:px-8 lg:px-12">
      <span className="text-loja-text">
        <Logo />
      </span>
      <span>Projeto académico IAIE · UMinho 2026/27</span>
      <nav aria-label="Rodapé" className="flex gap-6">
        <a href="#" className="hover:text-ouro">Envios</a>
        <a href="#" className="hover:text-ouro">Devoluções</a>
        <a href="#" className="hover:text-ouro">Contactos</a>
      </nav>
    </footer>
  );
}
