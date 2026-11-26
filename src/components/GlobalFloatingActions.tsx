import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { chatGestaoPro } from "@/lib/gestaopro-assistant.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Bot, Plus, Send, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { useCurrentUser } from "@/lib/permissions";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export function GlobalFloatingActions() {
  const qc = useQueryClient();
  const { data: user } = useCurrentUser();
  const [taskOpen, setTaskOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: "Olá! Sou o Copilot GestãoPro. Posso orientar sobre funcionários, documentos, relatórios e estoque.",
    },
  ]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [form, setForm] = useState({
    titulo: "",
    descricao: "",
    prioridade: "media",
    data_vencimento: "",
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!form.titulo) throw new Error("Informe o título da tarefa");
      const { error } = await supabase.from("tarefas").insert({
        titulo: form.titulo,
        descricao: form.descricao,
        prioridade: form.prioridade,
        status: "pendente",
        concluida: false,
        data_vencimento: form.data_vencimento || null,
        responsavel_id: user?.id,
        created_by: user?.id,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tarefa adicionada com sucesso!");
      qc.invalidateQueries({ queryKey: ["tarefas"] });
      setTaskOpen(false);
      setForm({ titulo: "", descricao: "", prioridade: "media", data_vencimento: "" });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const sendChat = useMutation({
    mutationFn: async (text: string) => {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("Sua sessão expirou. Entre novamente.");

      const nextMessages: ChatMessage[] = [...messages, { role: "user", content: text }];
      const result = await chatGestaoPro({
        data: { accessToken, messages: nextMessages },
      });
      return result.answer;
    },
    onSuccess: (answer) => {
      setMessages((current) => [...current, { role: "assistant", content: answer }]);
      setMessage("");
      window.requestAnimationFrame(() =>
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }),
      );
    },
    onError: (error: any) => toast.error(error?.message || "Não foi possível conversar com o Copilot."),
  });

  const submitMessage = () => {
    const text = message.trim();
    if (!text || sendChat.isPending) return;
    setMessages((current) => [...current, { role: "user", content: text }]);
    sendChat.mutate(text);
  };

  const clearChat = () => {
    setMessages([
      {
        role: "assistant",
        content: "Conversa limpa. Como posso ajudar com o GestãoPro?",
      },
    ]);
  };

  return (
    <>
      <div className="fixed bottom-6 right-6 flex flex-col items-end gap-3 z-50">
        <Button
          size="icon"
          className="h-14 w-14 rounded-full shadow-lg bg-primary hover:bg-primary/90 text-primary-foreground transition-transform hover:scale-105"
          onClick={() => setTaskOpen(true)}
          title="Adicionar Tarefa Rápida"
          aria-label="Adicionar tarefa rápida"
        >
          <Plus className="h-6 w-6" />
        </Button>

        <Button
          size="icon"
          className="h-14 w-14 rounded-full shadow-xl bg-[#0E1D40] text-white hover:bg-[#162d64] transition-transform hover:scale-105"
          onClick={() => setCopilotOpen(true)}
          title="Abrir Copilot GestãoPro"
          aria-label="Abrir Copilot GestãoPro"
        >
          <Bot className="h-7 w-7" />
        </Button>
      </div>

      {copilotOpen && (
        <div
          className="fixed bottom-24 right-6 z-[60] flex h-[min(600px,calc(100vh-112px))] w-[min(390px,calc(100vw-32px))] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl"
          role="dialog"
          aria-label="Copilot GestãoPro"
        >
          <div className="flex items-center justify-between border-b bg-[#0E1D40] px-4 py-3 text-white">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold">Copilot GestãoPro</p>
                <p className="text-[11px] text-white/70">Assistente operacional</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-white hover:bg-white/10 hover:text-white"
                onClick={clearChat}
                title="Limpar conversa"
                aria-label="Limpar conversa"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-white hover:bg-white/10 hover:text-white"
                onClick={() => setCopilotOpen(false)}
                title="Fechar Copilot"
                aria-label="Fechar Copilot"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto bg-muted/20 p-4">
            {messages.map((item, index) => (
              <div
                key={`${item.role}-${index}`}
                className={`flex ${item.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-relaxed shadow-sm ${
                    item.role === "user"
                      ? "rounded-br-sm bg-primary text-primary-foreground"
                      : "rounded-bl-sm border bg-card text-card-foreground"
                  }`}
                >
                  {item.content}
                </div>
              </div>
            ))}
            {sendChat.isPending && (
              <div className="flex justify-start">
                <div class="rounded-2xl rounded-bl-sm border bg-card px-3 py-2 text-sm text-muted-foreground">
                  Pensando…
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="border-t bg-background p-3">
            <div className="flex gap-2">
              <Textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    submitMessage();
                  }
                }}
                placeholder="Digite sua pergunta..."
                className="min-h-11 max-h-28 resize-none"
                rows={1}
              />
              <Button
                size="icon"
                onClick={submitMessage}
                disabled={!message.trim() || sendChat.isPending}
                title="Enviar"
                aria-label="Enviar mensagem"
                className="h-11 w-11 shrink-0"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      <Dialog open={taskOpen} onOpenChange={setTaskOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Nova Tarefa Rápida</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Título</Label>
              <Input
                value={form.titulo}
                onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                placeholder="Ex: Comprar cimento"
              />
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea
                value={form.descricao}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Prioridade</Label>
                <Select
                  value={form.prioridade}
                  onValueChange={(v) => setForm({ ...form, prioridade: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="baixa">Baixa</SelectItem>
                    <SelectItem value="media">Média</SelectItem>
                    <SelectItem value="alta">Alta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Vencimento</Label>
                <Input
                  type="date"
                  value={form.data_vencimento}
                  onChange={(e) => setForm({ ...form, data_vencimento: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTaskOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => create.mutate()} disabled={create.isPending}>
              Salvar Tarefa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
