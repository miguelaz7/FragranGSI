import { Header } from "@/components/loja/Header";
import { Footer } from "@/components/loja/Footer";

// Layout de todas as páginas da loja (tema escuro).
// O backoffice (/admin) tem o seu próprio layout claro.
export default function LojaLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen flex-col bg-loja-bg text-loja-text">
      <Header />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 sm:px-8 lg:px-12">{children}</main>
      <Footer />
    </div>
  );
}
