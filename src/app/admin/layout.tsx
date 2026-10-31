import { AdminNav } from "@/components/admin/AdminNav";

// Layout do backoffice (tema claro, barra lateral escura).
// TODO: proteger /admin com Auth0 (role admin) antes de ir para produção.
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="flex min-h-screen flex-wrap bg-admin-bg text-admin-text">
      <AdminNav />
      <main className="flex min-w-0 flex-[999_1_560px] flex-col gap-7 px-4 py-8 sm:px-10">
        {children}
      </main>
    </div>
  );
}
