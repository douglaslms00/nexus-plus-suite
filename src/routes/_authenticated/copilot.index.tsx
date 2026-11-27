import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bot, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/lib/permissions";
import { askCopilot } from "@/lib/copilot.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Shimmer } from "@/components/ai-elements/shimmer";

export const Route = createFileRoute("/_authenticated/copilot/")({ component: CopilotHome });
type Stored = { role: "user" | "assistant"; parts: { type: "text"; text: string }[] };

function CopilotHome() {
  const { data: user } = useCurrentUser();
  const navigate = Route.useNavigate();
  const threadQuery = useQuery({
    queryKey: ["copilot-single-thread", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("copilot_threads")
        .select("id").eq("user_id", user!.id)
        .order("updated_at", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      if (data) return data.id;
      const created = await supabase.from("copilot_threads")
        .insert({ user_id: user!.id }).select("id").single();
      if (created.error) throw created.error;
      return created.data.id;
    },
  });
  useEffect(() => {
    if (threadQuery.data) navigate({ to: "/copilot/$threadId", params: { threadId: threadQuery.data }, replace: true });
  }, [threadQuery.data, navigate]);
  return <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">{threadQuery.isError ? "Não foi possível abrir a conversa. Feche e tente novamente." : "Preparando sua conversa…"}</div>;
}

export const ThreadRoute = createFileRoute("/_authenticated/copilot/$threadId")({ component: ThreadChat });
function ThreadChat() {
  const { threadId } = ThreadRoute.useParams();
  const qc = useQueryClient();
  const { data: user } = useCurrentUser();
  const ask = useServerFn(askCopilot);
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const messages = useQuery({
    queryKey: ["copilot-messages", threadId, user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("copilot_messages")
        .select("id,ui_message").eq("thread_id", threadId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data.map((r) => ({ id: r.id, ...(r.ui_message as unknown as Stored) }));
    },
  });
  const send = useMutation({
    mutationFn: (message: string) => ask({ data: { threadId, text: message } }),
    onSettled: async () => {
      await qc.invalidateQueries({ queryKey: ["copilot-messages", threadId] });
      await qc.invalidateQueries({ queryKey: ["copilot-threads"] });
      inputRef.current?.focus();
    },
    onError: (e: Error) => toast.error(e.message || "Não foi possível consultar o Copilot."),
  });
  useEffect(() => inputRef.current?.focus(), []);
  const list = messages.data ?? [];

  return <>
    <div className="flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite">
      {list.length === 0 && !send.isPending && !messages.isLoading && <div className="flex h-full flex-col items-center justify-center gap-3 text-center"><div className="rounded-full bg-primary/10 p-4 text-primary"><Bot className="h-7 w-7" /></div><p className="font-medium">Como posso ajudar?</p><p className="max-w-xs text-sm text-muted-foreground">Posso consultar funcionários, documentos pessoais, tarefas e estoque dentro das permissões da sua conta.</p></div>}
      {messages.isLoading && <p className="text-center text-sm text-muted-foreground">Carregando mensagens…</p>}
      {list.map((message) => <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}><div className={`max-w-[90%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm ${message.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{message.parts.map((part) => part.text).join("")}</div></div>)}
      {send.isPending && <div className="flex justify-start"><div className="rounded-2xl bg-muted px-3.5 py-2.5 text-sm"><Shimmer>Pensando…</Shimmer></div></div>}
    </div>
    <form className="flex shrink-0 gap-2 border-t p-3" onSubmit={(e) => { e.preventDefault(); const message = text.trim(); if (!message || send.isPending) return; setText(""); send.mutate(message); }}>
      <Input ref={inputRef} value={text} onChange={(e) => setText(e.target.value)} placeholder="Pergunte sobre sua equipe, tarefas ou estoque…" aria-label="Mensagem para o Copilot" maxLength={4000} />
      <Button type="submit" size="icon" disabled={!text.trim() || send.isPending} aria-label="Enviar mensagem"><Send className="h-4 w-4" /></Button>
    </form>
  </>;
}
