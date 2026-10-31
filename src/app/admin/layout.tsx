import { Suspense } from "react";
import { AdminNav } from "@/components/admin/AdminNav";
import { AnalystProvider } from "@/components/admin/AnalystProvider";
import { AnalystWidget } from "@/components/admin/AnalystWidget";

// Layout do backoffice (tema claro, barra lateral escura).
// TODO: proteger /admin com Auth0 (role admin) antes de ir para produção.
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    // O AnalystProvider guarda as conversas do Analista IA para todo o backoffice
    <AnalystProvider>
      <div className="flex min-h-screen flex-wrap bg-admin-bg text-admin-text">
        <AdminNav />
        {/* pb-20: espaço para o separador do Analista IA não tapar o fim da página */}
        <main className="flex min-w-0 flex-[999_1_560px] flex-col gap-7 px-4 pt-8 pb-20 sm:px-10">
          {children}
        </main>
      </div>
      <Suspense>
        <AnalystWidget />
      </Suspense>
    </AnalystProvider>
  );
}
