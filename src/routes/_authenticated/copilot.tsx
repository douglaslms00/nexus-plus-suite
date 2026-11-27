import { createFileRoute, Link, Outlet, useNavigate, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, MessageSquarePlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/copilot")({ component: CopilotLayout });

function CopilotLayout() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: user } = useCurrentUser();
  const params = useParams({ strict: false });
  const activeId = (params as { threadId?: string }).threadId;

  const threads = useQuery({
    queryKey: ["copilot-threads", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("copilot_threads")
        .select("id,title,updated_at")
        .eq("user_id", user!.id)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("copilot_threads")
        .insert({ user_id: user!.id })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["copilot-threads"] });
      navigate({ to: "/copilot/$threadId", params: { threadId: id } });
    },
    onError: () => toast.error("Não foi possível criar a conversa."),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("copilot_threads").delete().eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["copilot-threads"] });
      if (id === activeId) navigate({ to: "/copilot" });
    },
    onError: () => toast.error("Não foi possível excluir a conversa."),
  });

  return (
    <div className="flex h-[calc(100vh-8rem)] min-h-[480px] overflow-hidden rounded-xl border bg-background">
      <aside className={cn("w-full shrink-0 flex-col border-r bg-muted/30 sm:flex sm:w-64", activeId ? "hidden" : "flex")}>
        <div className="flex items-center gap-2 border-b p-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0E1D40] text-white">
            <Bot className="h-4 w-4" />
          </div>
          <p className="flex-1 text-sm font-semibold">Copilot GestãoPro</p>
        </div>
        <div className="p-3">
          <Button className="w-full" onClick={() => create.mutate()} disabled={!user || create.isPending}>
            <MessageSquarePlus className="mr-2 h-4 w-4" /> Nova conversa
          </Button>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-2 pb-3">
          {threads.data?.length === 0 && (
            <p className="px-2 py-4 text-xs text-muted-foreground">Nenhuma conversa ainda.</p>
          )}
          {threads.data?.map((t) => (
            <div
              key={t.id}
              className={cn(
                "group flex items-center gap-1 rounded-md pr-1",
                t.id === activeId ? "bg-primary/10" : "hover:bg-muted",
              )}
            >
              <Link
                to="/copilot/$threadId"
                params={{ threadId: t.id }}
                className="min-w-0 flex-1 truncate px-2 py-2 text-sm"
              >
                {t.title}
              </Link>
              <button
                type="button"
                aria-label="Excluir conversa"
                className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive"
                onClick={() => remove.mutate(t.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </nav>
      </aside>
      <section className={cn("min-w-0 flex-1 flex-col", activeId ? "flex" : "hidden sm:flex")}>
        <Outlet />
      </section>
    </div>
  );
}
