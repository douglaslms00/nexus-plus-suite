import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { ObraProvider } from "@/lib/obra-context";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user) {
        return { user: session.user };
      }
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) throw redirect({ to: "/auth" });
      return { user: data.user };
    } catch (e) {
      // Erro de configuração (ex.: VITE_SUPABASE_* ausentes no build publicado):
      // mostra o ErrorBoundary com mensagem acionável em vez de redirect mudo.
      const msg = e instanceof Error ? e.message : String((e as object) ?? "");
      if (msg.includes("Missing Supabase")) {
        throw new Error(
          `${msg} — configure VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no ambiente de build (publish) e faça novo deploy.`,
        );
      }
      // redirect() deve atravessar; qualquer outro erro (rede/Supabase fora)
      // não pode virar tela branca — deixa o ErrorBoundary da rota tratar
      // apenas quando for definitivo, senão manda para /auth.
      if (e != null && typeof e === "object" && "statusCode" in (e as Record<string, unknown>)) {
        throw e;
      }
      // Se já é um redirect do TanStack, repassa.
      if (
        e instanceof Response ||
        (e != null &&
          typeof e === "object" &&
          "to" in (e as Record<string, unknown>))
      ) {
        throw e;
      }
      throw redirect({ to: "/auth" });
    }
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return (
    <ObraProvider>
      <AppShell>
        <Outlet />
      </AppShell>
    </ObraProvider>
  );
}
