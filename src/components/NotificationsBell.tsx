import { useEffect, useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Bell, Check, Trash2, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDistanceToNow, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

type Notif = {
  id: string;
  tipo: string;
  titulo: string;
  mensagem: string | null;
  link: string | null;
  ref_id: string | null;
  ref_table: string | null;
  lida: boolean;
  created_at: string;
};

export function NotificationsBell() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: user } = useCurrentUser();
  const [open, setOpen] = useState(false);

  const { data: notifs = [] } = useQuery({
    queryKey: ["notifications", user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<Notif[]> => {
      const { data, error } = await supabase
        .from("notifications" as any)
        .select("id, tipo, titulo, mensagem, link, ref_id, ref_table, lida, created_at, user_id")
        .eq("user_id", user?.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as any;
    },
  });

  // Gera avisos de vencimentos (ASO, treinamentos, contas, manutenções) no máximo a cada 6h
  useEffect(() => {
    if (!user?.id) return;
    const key = `venc_check_${user.id}`;
    const last = Number(localStorage.getItem(key) ?? 0);
    if (Date.now() - last < 6 * 60 * 60 * 1000) return;
    localStorage.setItem(key, String(Date.now()));
    (supabase as any).rpc("gerar_notificacoes_vencimentos").then(({ data, error }: any) => {
      if (!error && data > 0) qc.invalidateQueries({ queryKey: ["notifications", user.id] });
    });
  }, [user?.id, qc]);

  useEffect(() => {
    if (!user?.id) return;
    const myId = user.id;
    const channelName = `notifications-${myId}-${Math.random().toString(36).slice(2)}`;
    const channel = supabase.channel(channelName);
    channel
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${myId}` },
        (payload: any) => {
          // Defesa em profundidade: ignora qualquer payload que não pertença ao usuário atual
          const row = payload?.new ?? payload?.old;
          if (row && row.user_id && row.user_id !== myId) return;
          qc.invalidateQueries({ queryKey: ["notifications", myId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, qc]);

  // Limpa cache de notificações ao sair, evitando vazamento entre contas na mesma aba
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        qc.removeQueries({ queryKey: ["notifications"] });
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [qc]);

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      if (!user?.id) return;
      const { error } = await supabase
        .from("notifications" as any)
        .update({ lida: true })
        .eq("id", id)
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications", user?.id] }),
  });
  const markAllRead = useMutation({
    mutationFn: async () => {
      if (!user?.id) return;
      const { error } = await supabase
        .from("notifications" as any)
        .update({ lida: true })
        .eq("user_id", user.id)
        .eq("lida", false);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications", user?.id] }),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      if (!user?.id) return;
      const { error } = await supabase
        .from("notifications" as any)
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications", user?.id] }),
  });

  const handleNavigate = useCallback(
    (n: Notif) => {
      if (!n.link) return;
      if (!n.lida) markRead.mutate(n.id);
      setOpen(false);
      // Constrói URL com highlight do item para o destino poder destacar/scrollar
      let target = n.link;
      if (n.ref_id) {
        const sep = target.includes("?") ? "&" : "?";
        target = `${target}${sep}highlight=${n.ref_id}`;
      }
      // @ts-ignore - TanStack Router aceita string com query
      navigate({ to: target as any });
    },
    [markRead, navigate],
  );

  const unread = notifs.filter((n) => !n.lida).length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notificações">
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full h-4 min-w-4 px-1 flex items-center justify-center">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between p-3 border-b">
          <p className="font-medium text-sm">Notificações</p>
          {unread > 0 && (
            <Button size="sm" variant="ghost" onClick={() => markAllRead.mutate()}>
              <Check className="h-3 w-3" /> Marcar todas
            </Button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {notifs.length === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground">Nenhuma notificação.</p>
          )}
          {notifs.map((n) => {
            const clickable = !!n.link;
            return (
              <div
                key={n.id}
                role={clickable ? "button" : undefined}
                tabIndex={clickable ? 0 : undefined}
                title={clickable ? "Clique para ir ao item" : undefined}
                className={cn(
                  "p-3 border-b flex gap-2 items-start text-left w-full",
                  clickable
                    ? "cursor-pointer hover:bg-muted/60 hover:bg-accent/50 active:bg-muted transition-colors"
                    : "cursor-default",
                  !n.lida && "bg-primary/5",
                )}
                onClick={() => {
                  if (clickable) handleNavigate(n);
                  else if (!n.lida) markRead.mutate(n.id);
                }}
                onKeyDown={(e) => {
                  if (clickable && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    handleNavigate(n);
                  }
                }}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate flex items-center gap-1">
                    {n.titulo}
                    {clickable && <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />}
                  </p>
                  {n.mensagem && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{n.mensagem}</p>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {formatDistanceToNow(parseISO(n.created_at), { addSuffix: true, locale: ptBR })}
                  </p>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    remove.mutate(n.id);
                  }}
                  aria-label="Remover notificação"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
