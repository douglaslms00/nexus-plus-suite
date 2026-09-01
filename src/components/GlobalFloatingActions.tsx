import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bot, Plus, Send, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { useCurrentUser } from "@/lib/permissions";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export function GlobalFloatingActions() {
  const qc = useQueryClient();
  const { data: user } = useCurrentUser();
  const [taskOpen, setTaskOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  
  const [form, setForm] = useState({ titulo: "", descricao: "", prioridade: "media", data_vencimento: "" });
  const [chat, setChat] = useState<{role: "user"|"ai", text: string}[]>([
    { role: "ai", text: "Olá! Sou sua assistente virtual IA. Como posso ajudar você no GestãoPro hoje?" }
  ]);
  const [msg, setMsg] = useState("");

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

  const handleSendAi = (e: React.FormEvent) => {
    e.preventDefault();
    if (!msg.trim()) return;
    setChat((prev) => [...prev, { role: "user", text: msg }]);
    setMsg("");
    setTimeout(() => {
      setChat((prev) => [...prev, { role: "ai", text: "No momento sou uma demonstração visual da IA, mas em breve serei conectada ao motor principal para interagir com suas obras, tarefas e relatórios do sistema!" }]);
    }, 1000);
  };

  return (
    <>
      <div className="fixed bottom-6 right-6 flex flex-col gap-3 z-50">
        <Button 
          size="icon" 
          className="h-14 w-14 rounded-full shadow-lg bg-primary hover:bg-primary/90 text-primary-foreground transition-transform hover:scale-105"
          onClick={() => setTaskOpen(true)}
          title="Adicionar Tarefa Rápida"
        >
          <Plus className="h-6 w-6" />
        </Button>
        
        <Button 
          size="icon" 
          className="h-14 w-14 rounded-full shadow-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-transform hover:scale-105"
          onClick={() => setAiOpen(!aiOpen)}
          title="Assistente IA"
        >
          <Sparkles className="h-6 w-6" />
        </Button>
      </div>

      <Dialog open={taskOpen} onOpenChange={setTaskOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Nova Tarefa Rápida</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Título</Label>
              <Input value={form.titulo} onChange={e => setForm({...form, titulo: e.target.value})} placeholder="Ex: Comprar cimento" />
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea value={form.descricao} onChange={e => setForm({...form, descricao: e.target.value})} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Prioridade</Label>
                <Select value={form.prioridade} onValueChange={v => setForm({...form, prioridade: v})}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="baixa">Baixa</SelectItem>
                    <SelectItem value="media">Média</SelectItem>
                    <SelectItem value="alta">Alta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Vencimento</Label>
                <Input type="date" value={form.data_vencimento} onChange={e => setForm({...form, data_vencimento: e.target.value})} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTaskOpen(false)}>Cancelar</Button>
            <Button onClick={() => create.mutate()} disabled={create.isPending}>Salvar Tarefa</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {aiOpen && (
        <Card className="fixed bottom-28 right-6 w-[340px] sm:w-[380px] shadow-2xl z-50 flex flex-col h-[500px] animate-in slide-in-from-bottom-5">
          <CardHeader className="bg-indigo-600 text-white rounded-t-lg px-4 py-3 flex flex-row items-center justify-between space-y-0">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              <CardTitle className="text-base font-medium">Assistente IA</CardTitle>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-white hover:bg-indigo-700 hover:text-white" onClick={() => setAiOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto p-4 space-y-4 bg-muted/30">
            {chat.map((c, i) => (
              <div key={i} className={`flex ${c.role === "ai" ? "justify-start" : "justify-end"}`}>
                <div className={`text-sm px-3 py-2 rounded-xl max-w-[85%] ${c.role === "ai" ? "bg-background border text-foreground" : "bg-indigo-600 text-white"}`}>
                  {c.text}
                </div>
              </div>
            ))}
          </CardContent>
          <div className="p-3 bg-background border-t rounded-b-lg">
            <form onSubmit={handleSendAi} className="flex items-center gap-2">
              <Input 
                value={msg} 
                onChange={e => setMsg(e.target.value)} 
                placeholder="Pergunte algo ao assistente..." 
                className="flex-1"
              />
              <Button type="submit" size="icon" className="bg-indigo-600 hover:bg-indigo-700 text-white shrink-0">
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </Card>
      )}
    </>
  );
}
