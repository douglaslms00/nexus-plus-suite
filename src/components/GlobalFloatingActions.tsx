import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { useCurrentUser } from "@/lib/permissions";

export function GlobalFloatingActions() {
  const qc = useQueryClient();
  const { data: user } = useCurrentUser();
  const [taskOpen, setTaskOpen] = useState(false);

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
      </div>

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
