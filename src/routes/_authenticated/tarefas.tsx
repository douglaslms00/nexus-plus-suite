import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { canManage, isAdmin, useCurrentUser, useUserRoles } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/tarefas")({
  component: TarefasPage,
});

const PRIO_LABEL: Record<string, string> = { baixa: "Baixa", media: "Média", alta: "Alta" };
const STATUS_LABEL: Record<string, string> = { pendente: "Pendente", em_andamento: "Em andamento", concluida: "Concluída" };

function TarefasPage() {
  const qc = useQueryClient();
  const { data: user } = useCurrentUser();
  const { data: roles } = useUserRoles();
  const canCreate = canManage(roles);
  const canDelete = isAdmin(roles);

  const { data: tarefas = [] } = useQuery({
    queryKey: ["tarefas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tarefas").select("*, responsavel:profiles!tarefas_responsavel_id_fkey(nome)").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: pessoas = [] } = useQuery({
    queryKey: ["profiles-min"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, nome");
      if (error) throw error;
      return data;
    },
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ prioridade: "media", status: "pendente" });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("tarefas").insert({
        titulo: form.titulo, descricao: form.descricao, prioridade: form.prioridade,
        status: form.status, responsavel_id: form.responsavel_id || null,
        data_vencimento: form.data_vencimento || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Tarefa criada"); qc.invalidateQueries({ queryKey: ["tarefas"] }); qc.invalidateQueries({ queryKey: ["dash-tarefas"] }); setOpen(false); setForm({ prioridade: "media", status: "pendente" }); },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleDone = useMutation({
    mutationFn: async ({ id, concluida }: { id: string; concluida: boolean }) => {
      const { error } = await supabase.from("tarefas").update({
        concluida, status: concluida ? "concluida" : "em_andamento",
        concluida_em: concluida ? new Date().toISOString() : null,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tarefas"] }); qc.invalidateQueries({ queryKey: ["dash-tarefas"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "pendente" | "em_andamento" | "concluida" }) => {
      const { error } = await supabase.from("tarefas").update({ status, concluida: status === "concluida" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tarefas"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tarefas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Tarefa excluída"); qc.invalidateQueries({ queryKey: ["tarefas"] }); },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tarefas</h1>
          <p className="text-muted-foreground">Atribua, acompanhe e conclua tarefas.</p>
        </div>
        {canCreate && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4" /> Nova tarefa</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Nova tarefa</DialogTitle></DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="space-y-3">
                <div className="space-y-1"><Label>Título *</Label><Input required value={form.titulo ?? ""} onChange={(e) => setForm({ ...form, titulo: e.target.value })} /></div>
                <div className="space-y-1"><Label>Descrição</Label><Textarea value={form.descricao ?? ""} onChange={(e) => setForm({ ...form, descricao: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Prioridade</Label>
                    <Select value={form.prioridade} onValueChange={(v) => setForm({ ...form, prioridade: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="baixa">Baixa</SelectItem>
                        <SelectItem value="media">Média</SelectItem>
                        <SelectItem value="alta">Alta</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1"><Label>Vencimento</Label><Input type="date" value={form.data_vencimento ?? ""} onChange={(e) => setForm({ ...form, data_vencimento: e.target.value })} /></div>
                </div>
                <div className="space-y-1">
                  <Label>Responsável</Label>
                  <Select value={form.responsavel_id ?? ""} onValueChange={(v) => setForm({ ...form, responsavel_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {pessoas.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <DialogFooter><Button type="submit" disabled={create.isPending}>{create.isPending ? "Salvando..." : "Criar"}</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="grid gap-3">
        {tarefas.map((t: any) => {
          const canToggle = canCreate || t.responsavel_id === user?.id;
          return (
            <Card key={t.id} className="p-4">
              <div className="flex items-start gap-3">
                <Checkbox
                  checked={t.concluida}
                  disabled={!canToggle}
                  onCheckedChange={(v) => toggleDone.mutate({ id: t.id, concluida: !!v })}
                  className="mt-1"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className={cn("font-medium", t.concluida && "line-through text-muted-foreground")}>{t.titulo}</h3>
                    <span className={cn(
                      "text-[10px] uppercase tracking-wide px-2 py-0.5 rounded",
                      t.prioridade === "alta" && "bg-destructive/15 text-destructive",
                      t.prioridade === "media" && "bg-warning/15 text-warning",
                      t.prioridade === "baixa" && "bg-muted text-muted-foreground",
                    )}>{PRIO_LABEL[t.prioridade]}</span>
                  </div>
                  {t.descricao && <p className="text-sm text-muted-foreground mt-1">{t.descricao}</p>}
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                    <span>Responsável: {t.responsavel?.nome ?? "—"}</span>
                    {t.data_vencimento && <span>Vence: {t.data_vencimento}</span>}
                  </div>
                </div>
                <div className="flex flex-col gap-2 items-end">
                  {canToggle ? (
                    <Select value={t.status} onValueChange={(v) => updateStatus.mutate({ id: t.id, status: v as "pendente" | "em_andamento" | "concluida" })}>
                      <SelectTrigger className="w-40 h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pendente">Pendente</SelectItem>
                        <SelectItem value="em_andamento">Em andamento</SelectItem>
                        <SelectItem value="concluida">Concluída</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="text-xs px-2 py-1 rounded bg-muted">{STATUS_LABEL[t.status]}</span>
                  )}
                  {canDelete && <Button size="icon" variant="ghost" onClick={() => { if (confirm("Excluir tarefa?")) remove.mutate(t.id); }}><Trash2 className="h-4 w-4" /></Button>}
                </div>
              </div>
            </Card>
          );
        })}
        {tarefas.length === 0 && <Card className="p-8 text-center text-muted-foreground">Nenhuma tarefa cadastrada.</Card>}
      </div>
    </div>
  );
}
