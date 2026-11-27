import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/lib/permissions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/copilot")({ component: CopilotLayout });

function CopilotLayout() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: user } = useCurrentUser();
  const threads = useQuery({
    queryKey: ["copilot-threads", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("copilot_threads")
        .select("id,title,updated_at").eq("user_id", user!.id)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const create = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("Faça login para usar o Copilot.");
      const { data, error } = await supabase.from("copilot_threads")
        .insert({ user_id: user.id }).select("id").single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: (id) => {
      void qc.invalidateQueries({ queryKey: ["copilot-threads", user?.id] });
      navigate({ to: "/copilot/$threadId", params: { threadId: id } });
    },
    onError: (e: Error) => toast.error(e.message || "Não foi possível abrir a conversa."),
  });
  const close = () => navigate({ to: "/dashboard" });

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-end bg-black/35 p-0 sm:p-4" onMouseDown={(e) => {
      if (e.target === e.currentTarget) close();
    }}>
      <section role="dialog" aria-modal="true" aria-label="Copilot GestãoPro"
        className="flex h-[100dvh] w-full flex-col overflow-hidden bg-background shadow-2xl sm:h-[min(760px,88dvh)] sm:max-w-[520px] sm:rounded-2xl sm:border">
        <header className="flex shrink-0 items-center gap-3 border-b bg-background px-4 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0E1D40] text-white"><Bot className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1"><p className="truncate font-semibold">Copilot GestãoPro</p><p className="text-xs text-muted-foreground">Conversa privada · acesso conforme seu perfil</p></div>
          <Button variant="ghost" size="icon" onClick={close} aria-label="Fechar Copilot"><X className="h-5 w-5" /></Button>
        </header>
        {threads.isLoading ? <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Carregando conversa…</div>
          : threads.isError ? <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center"><p className="text-sm text-destructive">Não foi possível carregar sua conversa.</p><Button variant="outline" onClick={() => void threads.refetch()}>Tentar novamente</Button></div>
          : threads.data?.[0] ? <Outlet />
          : <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center"><p className="text-sm text-muted-foreground">Inicie sua conversa privada com o Copilot.</p><Button onClick={() => create.mutate()} disabled={create.isPending}><Bot className="mr-2 h-4 w-4" />{create.isPending ? "Abrindo…" : "Começar conversa"}</Button></div>}
      </section>
    </div>
  );
}
