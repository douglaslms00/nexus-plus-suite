import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { ObraProvider } from "@/lib/obra-context";
import { useUserRoles } from "@/lib/permissions";
import { Building2, Clock } from "lucide-react";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.user) {
      return { user: session.user };
    }
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function PendingPermissionsScreen() {
  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/auth";
  };

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-8">
      <div className="flex flex-col items-center gap-6 max-w-md text-center">
        <div className="relative">
          <div className="h-20 w-20 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Building2 className="h-10 w-10 text-primary" />
          </div>
          <div className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-amber-100 border-2 border-white flex items-center justify-center">
            <Clock className="h-3.5 w-3.5 text-amber-600" />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-gray-900">Bem-vindo a MS GestãoPro</h1>
          <p className="text-gray-500 text-base leading-relaxed">
            Aguarde até que suas permissões sejam adicionadas ao seu acesso.
          </p>
        </div>

        <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          <Clock className="h-4 w-4 shrink-0" />
          <span>
            Entre em contato com o administrador do sistema para liberar seu acesso.
          </span>
        </div>

        <button
          onClick={handleLogout}
          className="text-sm text-gray-400 hover:text-gray-600 underline underline-offset-2 transition-colors"
        >
          Sair da conta
        </button>
      </div>
    </div>
  );
}

function AuthenticatedLayout() {
  const { data: roles, isLoading } = useUserRoles();

  // Enquanto carrega os roles, não renderiza nada para evitar flash
  if (isLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  // Se o usuário não tem nenhum cargo atribuído, mostra tela de espera
  if (roles && roles.length === 0) {
    return <PendingPermissionsScreen />;
  }

  return (
    <ObraProvider>
      <AppShell>
        <Outlet />
      </AppShell>
    </ObraProvider>
  );
}
