import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
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
import { Plus, Trash2, AlertTriangle, History, Pencil } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { differenceInCalendarDays, parseISO, format } from "date-fns";

export const Route = createFileRoute("/_authenticated/tarefas")({
  component: TarefasPage,
});

const PRIO_LABEL: Record<string, string> = { baixa: "Baixa", media: "Média", alta: "Alta" };
const STATUS_LABEL: Record<string, string> = { pendente: "Pendente", em_andamento: "Em andamento", concluida: "Concluída" };

function overdueInfo(t: any) {
  if (!t.data_vencimento || t.concluida) return null;
  const days = differenceInCalendarDays(parseISO(t.data_vencimento), new Date());
  if (days < 0) return { kind: "overdue" as const, days: Math.abs(days) };
  if (days <= 2) return { kind: "soon" as const, days };
  return null;
}

function TarefasPage() {
  const qc = useQueryClient();
  const { data: user } = useCurrentUser();
  const { data: roles } = useUserRoles();
  const canCreate = true; // qualquer usuário pode criar/atribuir tarefas
  const canDelete = isAdmin(roles);
  const isGestor = canManage(roles);


  const [fStatus, setFStatus] = useState<string>("todos");
  const [fPrio, setFPrio] = useState<string>("todos");
  const [onlyMine, setOnlyMine] = useState<boolean>(true);
  const [busca, setBusca] = useState("");

  const { data: tarefas = [] } = useQuery({
    queryKey: ["tarefas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tarefas").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      const ids = Array.from(new Set((data ?? []).map((t: any) => t.responsavel_id).filter(Boolean)));
      let nameMap = new Map<string, string>();
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("id, nome").in("id", ids);
        nameMap = new Map((profs ?? []).map((p: any) => [p.id, p.nome]));
      }
      return (data ?? []).map((t: any) => ({ ...t, responsavel: t.responsavel_id ? { nome: nameMap.get(t.responsavel_id) ?? "—" } : null }));
    },
  });

  const filtered = useMemo(() => {
    return tarefas.filter((t: any) => {
      if (onlyMine && user?.id
        && t.responsavel_id !== user.id
        && t.created_by !== user.id
        && t.assigned_to !== user.id) return false;
      if (fStatus !== "todos" && t.status !== fStatus) return false;
      if (fPrio !== "todos" && t.prioridade !== fPrio) return false;
      if (busca && !`${t.titulo} ${t.descricao ?? ""}`.toLowerCase().includes(busca.toLowerCase())) return false;
      return true;
    });
  }, [tarefas, onlyMine, fStatus, fPrio, busca, user?.id]);

  const overdueCount = useMemo(
    () => tarefas.filter((t: any) => overdueInfo(t)?.kind === "overdue" && (!onlyMine || t.responsavel_id === user?.id)).length,
    [tarefas, onlyMine, user?.id]
  );

  const { data: pessoas = [] } = useQuery({
    queryKey: ["profiles-min"],
    queryFn: async () => (await supabase.from("profiles").select("id, nome")).data ?? [],
  });

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<any>({ prioridade: "media", status: "pendente" });

  const openCreate = () => {
    setEditingId(null);
    setForm({ prioridade: "media", status: "pendente" });
    setOpen(true);
  };

  const openEdit = (t: any) => {
    setEditingId(t.id);
    setForm({
      titulo: t.titulo,
      descricao: t.descricao ?? "",
      prioridade: t.prioridade,
      status: t.status,
      data_vencimento: t.data_vencimento ?? "",
      assigned_to: t.assigned_to ?? "",
    });
    setOpen(true);
  };

  const create = useMutation({
    mutationFn: async () => {
      const assigned = form.assigned_to || null;
      if (editingId) {
        const original = tarefas.find((x: any) => x.id === editingId);
        const assignedChanged = original && original.assigned_to !== assigned;
        const patch: any = {
          titulo: form.titulo, descricao: form.descricao, prioridade: form.prioridade,
          data_vencimento: form.data_vencimento || null,
          assigned_to: assigned,
        };
        if (assignedChanged && assigned) {
          patch.assignment_status = "pendente";
          patch.assignment_response_at = null;
          patch.assignment_response_note = null;
          patch.responsavel_id = assigned;
        } else if (assignedChanged && !assigned) {
          patch.assignment_status = null;
        }
        const { error } = await supabase.from("tarefas").update(patch).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("tarefas").insert({
          titulo: form.titulo, descricao: form.descricao, prioridade: form.prioridade,
          status: form.status, responsavel_id: form.responsavel_id || assigned || null,
          data_vencimento: form.data_vencimento || null,
          ...(assigned ? { assigned_to: assigned, assignment_status: "pendente" } : {}),
        } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingId ? "Tarefa atualizada" : "Tarefa criada");
      qc.invalidateQueries({ queryKey: ["tarefas"] });
      setOpen(false); setEditingId(null);
      setForm({ prioridade: "media", status: "pendente" });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const respondAssignment = useMutation({
    mutationFn: async ({ id, decision, note }: { id: string; decision: "aceita" | "recusada"; note?: string }) => {
      const { error } = await supabase.from("tarefas").update({
        assignment_status: decision,
        assignment_response_at: new Date().toISOString(),
        assignment_response_note: note ?? null,
        ...(decision === "aceita" ? { responsavel_id: user?.id } : {}),
      } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => { toast.success(v.decision === "aceita" ? "Tarefa aceita" : "Tarefa recusada"); qc.invalidateQueries({ queryKey: ["tarefas"] }); },
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tarefas"] }),
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
    mutationFn: async (id: string) => { const { error } = await supabase.from("tarefas").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("Tarefa excluída"); qc.invalidateQueries({ queryKey: ["tarefas"] }); },
  });

  const [detailId, setDetailId] = useState<string | null>(null);
  const detailTask = tarefas.find((t: any) => t.id === detailId) ?? null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tarefas</h1>
          <p className="text-muted-foreground">Atribua, acompanhe e conclua tarefas.</p>
        </div>
        {canCreate && (
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditingId(null); }}>
            <Button onClick={openCreate}><Plus className="h-4 w-4" /> Nova tarefa</Button>
            <DialogContent>
              <DialogHeader><DialogTitle>{editingId ? "Editar tarefa" : "Nova tarefa"}</DialogTitle></DialogHeader>
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
                  <Label>Atribuir a (envia para aceitar/recusar)</Label>
                  <Select value={form.assigned_to ?? ""} onValueChange={(v) => setForm({ ...form, assigned_to: v })}>
                    <SelectTrigger><SelectValue placeholder="Ninguém (eu mesmo)" /></SelectTrigger>
                    <SelectContent>
                      {pessoas.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {editingId && form.assigned_to && (
                    <p className="text-[11px] text-muted-foreground">Alterar o destinatário reenvia a tarefa para aceitar/recusar.</p>
                  )}
                </div>

                <DialogFooter><Button type="submit" disabled={create.isPending}>{create.isPending ? "Salvando..." : editingId ? "Salvar" : "Criar"}</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {overdueCount > 0 && (
        <Card className="p-3 border-destructive/40 bg-destructive/10 flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-4 w-4" />
          <span className="text-sm font-medium">{overdueCount} tarefa(s) vencida(s) sem conclusão.</span>
        </Card>
      )}

      <Card className="p-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <Input placeholder="Buscar..." value={busca} onChange={(e) => setBusca(e.target.value)} />
          <Select value={fStatus} onValueChange={setFStatus}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos status</SelectItem>
              <SelectItem value="pendente">Pendente</SelectItem>
              <SelectItem value="em_andamento">Em andamento</SelectItem>
              <SelectItem value="concluida">Concluída</SelectItem>
            </SelectContent>
          </Select>
          <Select value={fPrio} onValueChange={setFPrio}>
            <SelectTrigger><SelectValue placeholder="Prioridade" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas prioridades</SelectItem>
              <SelectItem value="alta">Alta</SelectItem>
              <SelectItem value="media">Média</SelectItem>
              <SelectItem value="baixa">Baixa</SelectItem>
            </SelectContent>
          </Select>
          {isGestor && (
            <label className="flex items-center gap-2 text-sm px-3 rounded border">
              <Checkbox checked={onlyMine} onCheckedChange={(v) => setOnlyMine(!!v)} />
              Apenas minhas
            </label>
          )}
          <Button variant="ghost" onClick={() => { setBusca(""); setFStatus("todos"); setFPrio("todos"); }}>Limpar</Button>
        </div>
      </Card>

      <div className="grid gap-3">
        {filtered.map((t: any) => {
          const canToggle = canCreate || t.responsavel_id === user?.id;
          const od = overdueInfo(t);
          return (
            <Card key={t.id} className={cn("p-4", od?.kind === "overdue" && "border-destructive/60 bg-destructive/5", od?.kind === "soon" && "border-warning/60 bg-warning/5")}>
              <div className="flex items-start gap-3">
                <Checkbox
                  checked={t.concluida}
                  disabled={!canToggle}
                  onCheckedChange={(v) => toggleDone.mutate({ id: t.id, concluida: !!v })}
                  className="mt-1"
                />
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setDetailId(t.id)}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className={cn("font-medium", t.concluida && "line-through text-muted-foreground")}>{t.titulo}</h3>
                    <span className={cn(
                      "text-[10px] uppercase tracking-wide px-2 py-0.5 rounded",
                      t.prioridade === "alta" && "bg-destructive/15 text-destructive",
                      t.prioridade === "media" && "bg-warning/15 text-warning",
                      t.prioridade === "baixa" && "bg-muted text-muted-foreground",
                    )}>{PRIO_LABEL[t.prioridade]}</span>
                    {od?.kind === "overdue" && (
                      <span className="text-[10px] uppercase px-2 py-0.5 rounded bg-destructive text-destructive-foreground inline-flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" /> Vencida {od.days}d
                      </span>
                    )}
                    {od?.kind === "soon" && (
                      <span className="text-[10px] uppercase px-2 py-0.5 rounded bg-warning/20 text-warning">Vence em {od.days}d</span>
                    )}
                    {t.assignment_status === "pendente" && t.assigned_to && (
                      <span className="text-[10px] uppercase px-2 py-0.5 rounded bg-primary/15 text-primary">Aguardando resposta</span>
                    )}
                    {t.assignment_status === "aceita" && (
                      <span className="text-[10px] uppercase px-2 py-0.5 rounded bg-success/15 text-success">Aceita</span>
                    )}
                    {t.assignment_status === "recusada" && (
                      <span className="text-[10px] uppercase px-2 py-0.5 rounded bg-destructive/15 text-destructive">Recusada</span>
                    )}

                  </div>
                  {t.descricao && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{t.descricao}</p>}
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                    <span>Responsável: {t.responsavel?.nome ?? "—"}</span>
                    {t.data_vencimento && <span>Vence: {format(parseISO(t.data_vencimento), "dd/MM/yyyy")}</span>}
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
                  <div className="flex gap-1">
                    {t.assigned_to === user?.id && t.assignment_status === "pendente" && (
                      <>
                        <Button size="sm" variant="default" onClick={() => respondAssignment.mutate({ id: t.id, decision: "aceita" })}>Aceitar</Button>
                        <Button size="sm" variant="outline" onClick={() => respondAssignment.mutate({ id: t.id, decision: "recusada" })}>Recusar</Button>
                      </>
                    )}
                    {t.created_by === user?.id && (!t.assigned_to || t.assignment_status === "pendente") && (
                      <Button size="icon" variant="ghost" onClick={() => openEdit(t)} title="Editar"><Pencil className="h-4 w-4" /></Button>
                    )}
                    <Button size="icon" variant="ghost" onClick={() => setDetailId(t.id)} title="Detalhes"><History className="h-4 w-4" /></Button>
                    {canDelete && <Button size="icon" variant="ghost" onClick={() => { if (confirm("Excluir tarefa?")) remove.mutate(t.id); }}><Trash2 className="h-4 w-4" /></Button>}
                  </div>

                </div>
              </div>
            </Card>
          );
        })}
        {filtered.length === 0 && <Card className="p-8 text-center text-muted-foreground">Nenhuma tarefa encontrada.</Card>}
      </div>

      <TarefaDetailDialog
        tarefa={detailTask}
        onClose={() => setDetailId(null)}
        canEdit={!!detailTask && (canCreate || detailTask.responsavel_id === user?.id)}
        pessoas={pessoas}
      />
    </div>
  );
}

function TarefaDetailDialog({ tarefa, onClose, canEdit, pessoas }: { tarefa: any; onClose: () => void; canEdit: boolean; pessoas: any[] }) {
  const qc = useQueryClient();
  const { data: user } = useCurrentUser();
  const { data: execs = [] } = useQuery({
    queryKey: ["tarefa-execucoes", tarefa?.id],
    enabled: !!tarefa?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("tarefa_execucoes" as any).select("*").eq("tarefa_id", tarefa.id).order("executado_em", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const [editing, setEditing] = useState<any>(null);
  const [execForm, setExecForm] = useState<any>({});
  const open = !!tarefa;

  const save = useMutation({
    mutationFn: async () => {
      const payload: any = {
        tarefa_id: tarefa.id,
        executor_id: execForm.executor_id || user?.id || null,
        executor_nome: execForm.executor_nome || pessoas.find((p) => p.id === (execForm.executor_id || user?.id))?.nome || null,
        executado_em: execForm.executado_em ? new Date(execForm.executado_em).toISOString() : new Date().toISOString(),
        observacao: execForm.observacao || null,
      };
      if (editing) {
        const { error } = await supabase.from("tarefa_execucoes" as any).update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("tarefa_execucoes" as any).insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Registro salvo");
      qc.invalidateQueries({ queryKey: ["tarefa-execucoes", tarefa.id] });
      setEditing(null); setExecForm({});
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("tarefa_execucoes" as any).delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("Registro removido"); qc.invalidateQueries({ queryKey: ["tarefa-execucoes", tarefa.id] }); },
  });

  if (!tarefa) return null;
  const od = overdueInfo(tarefa);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{tarefa.titulo}</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          {tarefa.descricao && <p className="text-muted-foreground">{tarefa.descricao}</p>}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div><span className="text-muted-foreground">Status:</span> {STATUS_LABEL[tarefa.status]}</div>
            <div><span className="text-muted-foreground">Prioridade:</span> {PRIO_LABEL[tarefa.prioridade]}</div>
            <div><span className="text-muted-foreground">Vencimento:</span> {tarefa.data_vencimento ? format(parseISO(tarefa.data_vencimento), "dd/MM/yyyy") : "—"}</div>
            <div><span className="text-muted-foreground">Concluída em:</span> {tarefa.concluida_em ? format(parseISO(tarefa.concluida_em), "dd/MM/yyyy HH:mm") : "—"}</div>
          </div>
          {od?.kind === "overdue" && (
            <div className="rounded border border-destructive/50 bg-destructive/10 text-destructive p-2 text-xs flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Tarefa vencida há {od.days} dia(s).
            </div>
          )}

          <div className="pt-3 border-t">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-medium">Histórico de execução</h4>
            </div>

            {canEdit && (
              <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="grid gap-2 sm:grid-cols-2 p-3 rounded border mb-3">
                <div className="space-y-1 sm:col-span-1">
                  <Label className="text-xs">Executor</Label>
                  <Select value={execForm.executor_id ?? ""} onValueChange={(v) => setExecForm({ ...execForm, executor_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {pessoas.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Data/hora</Label>
                  <Input type="datetime-local" value={execForm.executado_em ?? ""} onChange={(e) => setExecForm({ ...execForm, executado_em: e.target.value })} />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs">Observação</Label>
                  <Textarea value={execForm.observacao ?? ""} onChange={(e) => setExecForm({ ...execForm, observacao: e.target.value })} />
                </div>
                <div className="sm:col-span-2 flex justify-end gap-2">
                  {editing && <Button type="button" variant="ghost" onClick={() => { setEditing(null); setExecForm({}); }}>Cancelar</Button>}
                  <Button type="submit" disabled={save.isPending}>{editing ? "Atualizar" : "Registrar"}</Button>
                </div>
              </form>
            )}

            <div className="space-y-2">
              {execs.length === 0 && <p className="text-xs text-muted-foreground">Sem registros.</p>}
              {execs.map((e: any) => {
                const nome = e.executor_nome ?? pessoas.find((p: any) => p.id === e.executor_id)?.nome ?? "—";
                const mine = e.created_by === user?.id;
                return (
                  <div key={e.id} className="rounded border p-2 text-xs flex items-start gap-2">
                    <div className="flex-1">
                      <div className="font-medium">{nome} <span className="text-muted-foreground font-normal">— {format(parseISO(e.executado_em), "dd/MM/yyyy HH:mm")}</span></div>
                      {e.observacao && <div className="text-muted-foreground mt-0.5 whitespace-pre-wrap">{e.observacao}</div>}
                    </div>
                    {(mine || canEdit) && (
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditing(e); setExecForm({ executor_id: e.executor_id, executor_nome: e.executor_nome, executado_em: e.executado_em?.slice(0,16), observacao: e.observacao }); }}><Pencil className="h-3 w-3" /></Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { if (confirm("Excluir registro?")) remove.mutate(e.id); }}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
