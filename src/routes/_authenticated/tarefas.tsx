import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { canManage, useCurrentUser, useUserRoles, useModulePerm } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  Trash2,
  AlertTriangle,
  History,
  Pencil,
  Columns3,
  List,
  Clock,
  PlayCircle,
  CheckCircle2,
  GripVertical,
  Calendar,
  User,
  ArrowRight,
  MoreVertical,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { differenceInCalendarDays, parseISO, format } from "date-fns";

export const Route = createFileRoute("/_authenticated/tarefas")({
  component: TarefasPage,
});

type TaskStatus = "pendente" | "em_andamento" | "concluida";

const PRIO_LABEL: Record<string, string> = { baixa: "Baixa", media: "Média", alta: "Alta" };
const STATUS_LABEL: Record<TaskStatus, string> = {
  pendente: "Pendente",
  em_andamento: "Em andamento",
  concluida: "Concluída",
};

const KANBAN_COLUMNS: {
  id: TaskStatus;
  label: string;
  badgeClass: string;
  columnBg: string;
  headerBorder: string;
  icon: typeof Clock;
  emptyText: string;
}[] = [
  {
    id: "pendente",
    label: "Pendente",
    badgeClass: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
    columnBg: "bg-muted/30 border-border/70",
    headerBorder: "border-b-amber-500/40 text-amber-600 dark:text-amber-400",
    icon: Clock,
    emptyText: "Nenhuma tarefa pendente",
  },
  {
    id: "em_andamento",
    label: "Em Andamento",
    badgeClass: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30",
    columnBg: "bg-muted/30 border-border/70",
    headerBorder: "border-b-blue-500/40 text-blue-600 dark:text-blue-400",
    icon: PlayCircle,
    emptyText: "Nenhuma tarefa em andamento",
  },
  {
    id: "concluida",
    label: "Concluída",
    badgeClass: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
    columnBg: "bg-muted/30 border-border/70",
    headerBorder: "border-b-emerald-500/40 text-emerald-600 dark:text-emerald-400",
    icon: CheckCircle2,
    emptyText: "Nenhuma tarefa concluída",
  },
];

function overdueInfo(t: any) {
  if (!t.data_vencimento || t.concluida || t.status === "concluida") return null;
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
  const permTarefas = useModulePerm("tarefas");
  const canDelete = permTarefas.can_delete;
  const isGestor = canManage(roles) || permTarefas.can_edit;

  const [viewMode, setViewMode] = useState<"kanban" | "lista">("kanban");
  const [fStatus, setFStatus] = useState<string>("todos");
  const [fPrio, setFPrio] = useState<string>("todos");
  const [onlyMine, setOnlyMine] = useState<boolean>(true);
  const [busca, setBusca] = useState("");

  // Drag and Drop state
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverColId, setDragOverColId] = useState<TaskStatus | null>(null);

  const { data: tarefas = [] } = useQuery({
    queryKey: ["tarefas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tarefas").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      const ids = Array.from(new Set((data ?? []).map((t: any) => t.responsavel_id).filter(Boolean)));
      let nameMap = new Map<string, string>();
      if (ids.length) {
        const { data: allProfs } = await (supabase as any).rpc("list_profile_directory");
        const profs = (allProfs ?? []).filter((p: any) => ids.includes(p.id));
        nameMap = new Map((profs ?? []).map((p: any) => [p.id, p.nome]));
      }
      return (data ?? []).map((t: any) => ({ ...t, responsavel: t.responsavel_id ? { nome: nameMap.get(t.responsavel_id) ?? "—" } : null }));
    },
  });

  const filtered = useMemo(() => {
    return tarefas.filter((t: any) => {
      if (
        onlyMine &&
        user?.id &&
        t.responsavel_id !== user.id &&
        t.created_by !== user.id &&
        t.assigned_to !== user.id
      )
        return false;
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
    queryFn: async () => (await (supabase as any).rpc("list_profile_directory")).data ?? [],
  });

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<any>({ prioridade: "media", status: "pendente" });

  const openCreate = (initialStatus: TaskStatus = "pendente") => {
    setEditingId(null);
    setForm({ prioridade: "media", status: initialStatus });
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
          titulo: form.titulo,
          descricao: form.descricao,
          prioridade: form.prioridade,
          status: form.status,
          concluida: form.status === "concluida",
          concluida_em: form.status === "concluida" ? (original?.concluida_em || new Date().toISOString()) : null,
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
        const isConcluida = form.status === "concluida";
        const { error } = await supabase.from("tarefas").insert({
          titulo: form.titulo,
          descricao: form.descricao,
          prioridade: form.prioridade,
          status: form.status,
          concluida: isConcluida,
          concluida_em: isConcluida ? new Date().toISOString() : null,
          responsavel_id: form.responsavel_id || assigned || null,
          data_vencimento: form.data_vencimento || null,
          ...(assigned ? { assigned_to: assigned, assignment_status: "pendente" } : {}),
        } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingId ? "Tarefa atualizada" : "Tarefa criada");
      qc.invalidateQueries({ queryKey: ["tarefas"] });
      setOpen(false);
      setEditingId(null);
      setForm({ prioridade: "media", status: "pendente" });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const respondAssignment = useMutation({
    mutationFn: async ({ id, decision, note }: { id: string; decision: "aceita" | "recusada"; note?: string }) => {
      const { error } = await supabase
        .from("tarefas")
        .update({
          assignment_status: decision,
          assignment_response_at: new Date().toISOString(),
          assignment_response_note: note ?? null,
          ...(decision === "aceita" ? { responsavel_id: user?.id } : {}),
        } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(v.decision === "aceita" ? "Tarefa aceita" : "Tarefa recusada");
      qc.invalidateQueries({ queryKey: ["tarefas"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleDone = useMutation({
    mutationFn: async ({ id, concluida }: { id: string; concluida: boolean }) => {
      const { error } = await supabase
        .from("tarefas")
        .update({
          concluida,
          status: concluida ? "concluida" : "em_andamento",
          concluida_em: concluida ? new Date().toISOString() : null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(v.concluida ? "Tarefa concluída!" : "Tarefa reaberta para 'Em andamento'");
      qc.invalidateQueries({ queryKey: ["tarefas"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: TaskStatus }) => {
      const isConcluida = status === "concluida";
      const { error } = await supabase
        .from("tarefas")
        .update({
          status,
          concluida: isConcluida,
          concluida_em: isConcluida ? new Date().toISOString() : null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      toast.success(`Tarefa movida para "${STATUS_LABEL[vars.status]}"`);
      qc.invalidateQueries({ queryKey: ["tarefas"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tarefas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tarefa excluída");
      qc.invalidateQueries({ queryKey: ["tarefas"] });
    },
  });

  const [detailId, setDetailId] = useState<string | null>(null);
  const detailTask = tarefas.find((t: any) => t.id === detailId) ?? null;

  const handleDropOnColumn = (targetStatus: TaskStatus) => {
    if (!draggedTaskId) return;
    const task = tarefas.find((x: any) => x.id === draggedTaskId);
    if (task && task.status !== targetStatus) {
      updateStatus.mutate({ id: draggedTaskId, status: targetStatus });
    }
    setDraggedTaskId(null);
    setDragOverColId(null);
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Top Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tarefas</h1>
          <p className="text-muted-foreground">Organize, atribua e movimente tarefas no modo Kanban ou Lista.</p>
        </div>

        <div className="flex items-center gap-2">
          {/* View Mode Toggle */}
          <div className="inline-flex items-center rounded-lg border bg-muted p-1 text-muted-foreground shadow-xs">
            <button
              type="button"
              onClick={() => setViewMode("kanban")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all cursor-pointer",
                viewMode === "kanban"
                  ? "bg-background text-foreground shadow-xs font-semibold"
                  : "hover:text-foreground"
              )}
            >
              <Columns3 className="h-3.5 w-3.5" />
              Kanban
            </button>
            <button
              type="button"
              onClick={() => setViewMode("lista")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all cursor-pointer",
                viewMode === "lista"
                  ? "bg-background text-foreground shadow-xs font-semibold"
                  : "hover:text-foreground"
              )}
            >
              <List className="h-3.5 w-3.5" />
              Lista
            </button>
          </div>

          {canCreate && (
            <Button onClick={() => openCreate("pendente")}>
              <Plus className="h-4 w-4" /> Nova tarefa
            </Button>
          )}
        </div>
      </div>

      {/* Overdue alert */}
      {overdueCount > 0 && (
        <Card className="p-3 border-destructive/40 bg-destructive/10 flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="text-sm font-medium">{overdueCount} tarefa(s) vencida(s) sem conclusão.</span>
        </Card>
      )}

      {/* Filter Bar */}
      <Card className="p-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <Input
            placeholder="Buscar por título ou descrição..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          <Select value={fStatus} onValueChange={setFStatus}>
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos status</SelectItem>
              <SelectItem value="pendente">Pendente</SelectItem>
              <SelectItem value="em_andamento">Em andamento</SelectItem>
              <SelectItem value="concluida">Concluída</SelectItem>
            </SelectContent>
          </Select>
          <Select value={fPrio} onValueChange={setFPrio}>
            <SelectTrigger>
              <SelectValue placeholder="Prioridade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas prioridades</SelectItem>
              <SelectItem value="alta">Alta</SelectItem>
              <SelectItem value="media">Média</SelectItem>
              <SelectItem value="baixa">Baixa</SelectItem>
            </SelectContent>
          </Select>
          {isGestor && (
            <label className="flex items-center gap-2 text-sm px-3 rounded-md border bg-background cursor-pointer select-none">
              <Checkbox checked={onlyMine} onCheckedChange={(v) => setOnlyMine(!!v)} />
              Apenas minhas
            </label>
          )}
          <Button
            variant="ghost"
            onClick={() => {
              setBusca("");
              setFStatus("todos");
              setFPrio("todos");
            }}
          >
            Limpar filtros
          </Button>
        </div>
      </Card>

      {/* MAIN VIEW: KANBAN OR LIST */}
      {viewMode === "kanban" ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-start">
          {KANBAN_COLUMNS.map((col) => {
            const colTasks = filtered.filter((t: any) => t.status === col.id);
            const isDragOver = dragOverColId === col.id;
            const Icon = col.icon;

            return (
              <div
                key={col.id}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (dragOverColId !== col.id) setDragOverColId(col.id);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setDragOverColId(null);
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  handleDropOnColumn(col.id);
                }}
                className={cn(
                  "flex flex-col rounded-xl border p-3 transition-all duration-200 min-h-[480px]",
                  col.columnBg,
                  isDragOver
                    ? "border-primary ring-2 ring-primary/30 bg-primary/5 shadow-md scale-[1.01]"
                    : "hover:border-border"
                )}
              >
                {/* Column Header */}
                <div className={cn("flex items-center justify-between pb-3 mb-3 border-b-2", col.headerBorder)}>
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    <h2 className="font-semibold text-sm tracking-tight text-foreground">{col.label}</h2>
                    <Badge variant="outline" className={cn("text-xs font-semibold px-2 py-0.5", col.badgeClass)}>
                      {colTasks.length}
                    </Badge>
                  </div>
                  {canCreate && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      onClick={() => openCreate(col.id)}
                      title={`Adicionar tarefa em ${col.label}`}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                {/* Column Cards Container */}
                <div className="space-y-3 flex-1 flex flex-col">
                  {colTasks.map((t: any) => {
                    const canToggle = canCreate || t.responsavel_id === user?.id || isGestor;
                    const od = overdueInfo(t);
                    const isDragging = draggedTaskId === t.id;

                    return (
                      <Card
                        key={t.id}
                        draggable={canToggle}
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", t.id);
                          e.dataTransfer.effectAllowed = "move";
                          setDraggedTaskId(t.id);
                        }}
                        onDragEnd={() => {
                          setDraggedTaskId(null);
                          setDragOverColId(null);
                        }}
                        className={cn(
                          "p-3.5 shadow-xs transition-all duration-150 relative group bg-card hover:shadow-md border",
                          canToggle ? "cursor-grab active:cursor-grabbing" : "cursor-default",
                          isDragging && "opacity-40 scale-95 border-dashed border-primary",
                          od?.kind === "overdue" && "border-destructive/60 bg-destructive/5",
                          od?.kind === "soon" && "border-warning/60 bg-warning/5"
                        )}
                      >
                        {/* Drag Handle & Top Row */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span
                              className={cn(
                                "text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-sm",
                                t.prioridade === "alta" && "bg-destructive/15 text-destructive",
                                t.prioridade === "media" && "bg-warning/15 text-warning",
                                t.prioridade === "baixa" && "bg-muted text-muted-foreground"
                              )}
                            >
                              {PRIO_LABEL[t.prioridade] ?? t.prioridade}
                            </span>

                            {od?.kind === "overdue" && (
                              <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-destructive text-destructive-foreground inline-flex items-center gap-1 font-medium">
                                <AlertTriangle className="h-2.5 w-2.5" /> Vencida {od.days}d
                              </span>
                            )}
                            {od?.kind === "soon" && (
                              <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-warning/20 text-warning font-medium">
                                Vence {od.days === 0 ? "hoje" : `em ${od.days}d`}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1">
                            {/* Move to status dropdown */}
                            {canToggle && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-6 w-6 text-muted-foreground hover:text-foreground"
                                    title="Mover para..."
                                  >
                                    <ArrowRight className="h-3 w-3" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-44">
                                  <DropdownMenuLabel className="text-xs">Mover para</DropdownMenuLabel>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    disabled={t.status === "pendente"}
                                    onClick={() => updateStatus.mutate({ id: t.id, status: "pendente" })}
                                  >
                                    <Clock className="h-3.5 w-3.5 text-amber-500 mr-2" />
                                    <span>Pendente</span>
                                    {t.status === "pendente" && <Check className="h-3.5 w-3.5 ml-auto" />}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    disabled={t.status === "em_andamento"}
                                    onClick={() => updateStatus.mutate({ id: t.id, status: "em_andamento" })}
                                  >
                                    <PlayCircle className="h-3.5 w-3.5 text-blue-500 mr-2" />
                                    <span>Em Andamento</span>
                                    {t.status === "em_andamento" && <Check className="h-3.5 w-3.5 ml-auto" />}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    disabled={t.status === "concluida"}
                                    onClick={() => updateStatus.mutate({ id: t.id, status: "concluida" })}
                                  >
                                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mr-2" />
                                    <span>Concluída</span>
                                    {t.status === "concluida" && <Check className="h-3.5 w-3.5 ml-auto" />}
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}

                            {/* Card menu */}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6 text-muted-foreground hover:text-foreground"
                                >
                                  <MoreVertical className="h-3 w-3" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => setDetailId(t.id)}>
                                  <History className="h-3.5 w-3.5 mr-2" /> Detalhes & Histórico
                                </DropdownMenuItem>
                                {t.created_by === user?.id && (!t.assigned_to || t.assignment_status === "pendente") && (
                                  <DropdownMenuItem onClick={() => openEdit(t)}>
                                    <Pencil className="h-3.5 w-3.5 mr-2" /> Editar
                                  </DropdownMenuItem>
                                )}
                                {canDelete && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      className="text-destructive focus:text-destructive"
                                      onClick={() => {
                                        if (confirm("Excluir tarefa?")) remove.mutate(t.id);
                                      }}
                                    >
                                      <Trash2 className="h-3.5 w-3.5 mr-2" /> Excluir
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>

                            <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0 ml-0.5" />
                          </div>
                        </div>

                        {/* Title & Description */}
                        <div
                          className="mt-2 cursor-pointer"
                          onClick={() => setDetailId(t.id)}
                        >
                          <h3
                            className={cn(
                              "font-semibold text-sm text-foreground leading-snug line-clamp-2",
                              t.concluida && "line-through text-muted-foreground"
                            )}
                          >
                            {t.titulo}
                          </h3>
                          {t.descricao && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                              {t.descricao}
                            </p>
                          )}
                        </div>

                        {/* Assignment Status badges */}
                        {t.assignment_status && t.assigned_to && (
                          <div className="mt-2.5">
                            {t.assignment_status === "pendente" && (
                              <span className="text-[10px] uppercase font-medium px-2 py-0.5 rounded bg-primary/15 text-primary inline-flex items-center gap-1">
                                <Clock className="h-2.5 w-2.5" /> Aguardando resposta
                              </span>
                            )}
                            {t.assignment_status === "aceita" && (
                              <span className="text-[10px] uppercase font-medium px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1">
                                <Check className="h-2.5 w-2.5" /> Atribuição aceita
                              </span>
                            )}
                            {t.assignment_status === "recusada" && (
                              <span className="text-[10px] uppercase font-medium px-2 py-0.5 rounded bg-destructive/15 text-destructive inline-flex items-center gap-1">
                                Recusada
                              </span>
                            )}
                          </div>
                        )}

                        {/* Action buttons if assigned to user and pending */}
                        {t.assigned_to === user?.id && t.assignment_status === "pendente" && (
                          <div className="flex gap-1.5 mt-2.5 pt-2 border-t">
                            <Button
                              size="sm"
                              className="h-7 text-xs flex-1"
                              onClick={() => respondAssignment.mutate({ id: t.id, decision: "aceita" })}
                            >
                              Aceitar
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs flex-1"
                              onClick={() => respondAssignment.mutate({ id: t.id, decision: "recusada" })}
                            >
                              Recusar
                            </Button>
                          </div>
                        )}

                        {/* Footer info: Responsável & Vencimento */}
                        <div className="flex items-center justify-between gap-2 mt-3 pt-2 border-t text-[11px] text-muted-foreground">
                          <div className="flex items-center gap-1 truncate max-w-[130px]" title={t.responsavel?.nome ?? "Sem responsável"}>
                            <User className="h-3 w-3 shrink-0" />
                            <span className="truncate">{t.responsavel?.nome ?? "—"}</span>
                          </div>

                          {t.data_vencimento && (
                            <div className="flex items-center gap-1 shrink-0" title={`Vencimento: ${format(parseISO(t.data_vencimento), "dd/MM/yyyy")}`}>
                              <Calendar className="h-3 w-3" />
                              <span>{format(parseISO(t.data_vencimento), "dd/MM/yy")}</span>
                            </div>
                          )}
                        </div>
                      </Card>
                    );
                  })}

                  {colTasks.length === 0 && (
                    <div className="flex-1 flex flex-col items-center justify-center p-6 border border-dashed rounded-lg text-center text-xs text-muted-foreground/70 min-h-[140px]">
                      <Icon className="h-6 w-6 mb-1 opacity-40" />
                      <p>{col.emptyText}</p>
                      {canCreate && (
                        <Button
                          variant="link"
                          size="sm"
                          className="h-auto p-0 text-xs mt-1"
                          onClick={() => openCreate(col.id)}
                        >
                          + Criar nesta coluna
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                {/* Quick Add Button at bottom */}
                {canCreate && colTasks.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full mt-3 text-xs text-muted-foreground hover:text-foreground justify-center border border-dashed border-border/80"
                    onClick={() => openCreate(col.id)}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar tarefa
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* LIST VIEW */
        <div className="grid gap-3">
          {filtered.map((t: any) => {
            const canToggle = canCreate || t.responsavel_id === user?.id || isGestor;
            const od = overdueInfo(t);
            return (
              <Card
                key={t.id}
                className={cn(
                  "p-4 transition-all hover:shadow-xs",
                  od?.kind === "overdue" && "border-destructive/60 bg-destructive/5",
                  od?.kind === "soon" && "border-warning/60 bg-warning/5"
                )}
              >
                <div className="flex items-start gap-3">
                  <Checkbox
                    checked={t.concluida}
                    disabled={!canToggle}
                    onCheckedChange={(v) => toggleDone.mutate({ id: t.id, concluida: !!v })}
                    className="mt-1"
                  />
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setDetailId(t.id)}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className={cn("font-medium", t.concluida && "line-through text-muted-foreground")}>
                        {t.titulo}
                      </h3>
                      <span
                        className={cn(
                          "text-[10px] uppercase tracking-wide px-2 py-0.5 rounded",
                          t.prioridade === "alta" && "bg-destructive/15 text-destructive",
                          t.prioridade === "media" && "bg-warning/15 text-warning",
                          t.prioridade === "baixa" && "bg-muted text-muted-foreground"
                        )}
                      >
                        {PRIO_LABEL[t.prioridade] ?? t.prioridade}
                      </span>
                      {od?.kind === "overdue" && (
                        <span className="text-[10px] uppercase px-2 py-0.5 rounded bg-destructive text-destructive-foreground inline-flex items-center gap-1 font-medium">
                          <AlertTriangle className="h-3 w-3" /> Vencida {od.days}d
                        </span>
                      )}
                      {od?.kind === "soon" && (
                        <span className="text-[10px] uppercase px-2 py-0.5 rounded bg-warning/20 text-warning font-medium">
                          Vence em {od.days}d
                        </span>
                      )}
                      {t.assignment_status === "pendente" && t.assigned_to && (
                        <span className="text-[10px] uppercase px-2 py-0.5 rounded bg-primary/15 text-primary">
                          Aguardando resposta
                        </span>
                      )}
                      {t.assignment_status === "aceita" && (
                        <span className="text-[10px] uppercase px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                          Aceita
                        </span>
                      )}
                      {t.assignment_status === "recusada" && (
                        <span className="text-[10px] uppercase px-2 py-0.5 rounded bg-destructive/15 text-destructive">
                          Recusada
                        </span>
                      )}
                    </div>
                    {t.descricao && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{t.descricao}</p>}
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                      <span>Responsável: {t.responsavel?.nome ?? "—"}</span>
                      {t.data_vencimento && (
                        <span>Vence: {format(parseISO(t.data_vencimento), "dd/MM/yyyy")}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 items-end">
                    {canToggle ? (
                      <Select
                        value={t.status}
                        onValueChange={(v) => updateStatus.mutate({ id: t.id, status: v as TaskStatus })}
                      >
                        <SelectTrigger className="w-40 h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pendente">Pendente</SelectItem>
                          <SelectItem value="em_andamento">Em andamento</SelectItem>
                          <SelectItem value="concluida">Concluída</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-xs px-2 py-1 rounded bg-muted">{STATUS_LABEL[t.status as TaskStatus] ?? t.status}</span>
                    )}
                    <div className="flex gap-1">
                      {t.assigned_to === user?.id && t.assignment_status === "pendente" && (
                        <>
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => respondAssignment.mutate({ id: t.id, decision: "aceita" })}
                          >
                            Aceitar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => respondAssignment.mutate({ id: t.id, decision: "recusada" })}
                          >
                            Recusar
                          </Button>
                        </>
                      )}
                      {t.created_by === user?.id && (!t.assigned_to || t.assignment_status === "pendente") && (
                        <Button size="icon" variant="ghost" onClick={() => openEdit(t)} title="Editar">
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" onClick={() => setDetailId(t.id)} title="Detalhes">
                        <History className="h-4 w-4" />
                      </Button>
                      {canDelete && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            if (confirm("Excluir tarefa?")) remove.mutate(t.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
          {filtered.length === 0 && (
            <Card className="p-8 text-center text-muted-foreground">Nenhuma tarefa encontrada.</Card>
          )}
        </div>
      )}

      {/* Creation & Edit Dialog */}
      {canCreate && (
        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) setEditingId(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? "Editar tarefa" : "Nova tarefa"}</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                create.mutate();
              }}
              className="space-y-3"
            >
              <div className="space-y-1">
                <Label>Título *</Label>
                <Input
                  required
                  value={form.titulo ?? ""}
                  onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                  placeholder="Nome ou objetivo da tarefa"
                />
              </div>
              <div className="space-y-1">
                <Label>Descrição</Label>
                <Textarea
                  value={form.descricao ?? ""}
                  onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                  placeholder="Instruções ou detalhes adicionais..."
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Status inicial</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pendente">Pendente</SelectItem>
                      <SelectItem value="em_andamento">Em andamento</SelectItem>
                      <SelectItem value="concluida">Concluída</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Prioridade</Label>
                  <Select value={form.prioridade} onValueChange={(v) => setForm({ ...form, prioridade: v })}>
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
              </div>
              <div className="space-y-1">
                <Label>Vencimento</Label>
                <Input
                  type="date"
                  value={form.data_vencimento ?? ""}
                  onChange={(e) => setForm({ ...form, data_vencimento: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Atribuir a (envia para aceitar/recusar)</Label>
                <Select value={form.assigned_to ?? ""} onValueChange={(v) => setForm({ ...form, assigned_to: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Ninguém (eu mesmo)" />
                  </SelectTrigger>
                  <SelectContent>
                    {pessoas.map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {editingId && form.assigned_to && (
                  <p className="text-[11px] text-muted-foreground">
                    Alterar o destinatário reenvia a tarefa para aceitar/recusar.
                  </p>
                )}
              </div>

              <DialogFooter>
                <Button type="submit" disabled={create.isPending}>
                  {create.isPending ? "Salvando..." : editingId ? "Salvar" : "Criar"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Detail Dialog */}
      <TarefaDetailDialog
        tarefa={detailTask}
        onClose={() => setDetailId(null)}
        canEdit={!!detailTask && (canCreate || detailTask.responsavel_id === user?.id || isGestor)}
        pessoas={pessoas}
      />
    </div>
  );
}

function TarefaDetailDialog({
  tarefa,
  onClose,
  canEdit,
  pessoas,
}: {
  tarefa: any;
  onClose: () => void;
  canEdit: boolean;
  pessoas: any[];
}) {
  const qc = useQueryClient();
  const { data: user } = useCurrentUser();
  const { data: execs = [] } = useQuery({
    queryKey: ["tarefa-execucoes", tarefa?.id],
    enabled: !!tarefa?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tarefa_execucoes" as any)
        .select("*")
        .eq("tarefa_id", tarefa.id)
        .order("executado_em", { ascending: false });
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
        executor_nome:
          execForm.executor_nome || pessoas.find((p) => p.id === (execForm.executor_id || user?.id))?.nome || null,
        executado_em: execForm.executado_em
          ? new Date(execForm.executado_em).toISOString()
          : new Date().toISOString(),
        observacao: execForm.observacao || null,
      };
      if (editing) {
        const { error } = await supabase
          .from("tarefa_execucoes" as any)
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("tarefa_execucoes" as any).insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Registro salvo");
      qc.invalidateQueries({ queryKey: ["tarefa-execucoes", tarefa.id] });
      setEditing(null);
      setExecForm({});
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tarefa_execucoes" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Registro removido");
      qc.invalidateQueries({ queryKey: ["tarefa-execucoes", tarefa.id] });
    },
  });

  if (!tarefa) return null;
  const od = overdueInfo(tarefa);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{tarefa.titulo}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          {tarefa.descricao && <p className="text-muted-foreground">{tarefa.descricao}</p>}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-muted-foreground">Status:</span> {STATUS_LABEL[tarefa.status as TaskStatus] ?? tarefa.status}
            </div>
            <div>
              <span className="text-muted-foreground">Prioridade:</span> {PRIO_LABEL[tarefa.prioridade] ?? tarefa.prioridade}
            </div>
            <div>
              <span className="text-muted-foreground">Vencimento:</span>{" "}
              {tarefa.data_vencimento ? format(parseISO(tarefa.data_vencimento), "dd/MM/yyyy") : "—"}
            </div>
            <div>
              <span className="text-muted-foreground">Concluída em:</span>{" "}
              {tarefa.concluida_em ? format(parseISO(tarefa.concluida_em), "dd/MM/yyyy HH:mm") : "—"}
            </div>
          </div>
          {od?.kind === "overdue" && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 text-destructive p-2 text-xs flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Tarefa vencida há {od.days} dia(s).
            </div>
          )}

          <div className="pt-3 border-t">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-medium">Histórico de execução</h4>
            </div>

            {canEdit && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  save.mutate();
                }}
                className="grid gap-2 sm:grid-cols-2 p-3 rounded-md border mb-3"
              >
                <div className="space-y-1 sm:col-span-1">
                  <Label className="text-xs">Executor</Label>
                  <Select
                    value={execForm.executor_id ?? ""}
                    onValueChange={(v) => setExecForm({ ...execForm, executor_id: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {pessoas.map((p: any) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Data/hora</Label>
                  <Input
                    type="datetime-local"
                    value={execForm.executado_em ?? ""}
                    onChange={(e) => setExecForm({ ...execForm, executado_em: e.target.value })}
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs">Observação</Label>
                  <Textarea
                    value={execForm.observacao ?? ""}
                    onChange={(e) => setExecForm({ ...execForm, observacao: e.target.value })}
                  />
                </div>
                <div className="sm:col-span-2 flex justify-end gap-2">
                  {editing && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setEditing(null);
                        setExecForm({});
                      }}
                    >
                      Cancelar
                    </Button>
                  )}
                  <Button type="submit" disabled={save.isPending}>
                    {editing ? "Atualizar" : "Registrar"}
                  </Button>
                </div>
              </form>
            )}

            <div className="space-y-2">
              {execs.length === 0 && <p className="text-xs text-muted-foreground">Sem registros.</p>}
              {execs.map((e: any) => {
                const nome = e.executor_nome ?? pessoas.find((p: any) => p.id === e.executor_id)?.nome ?? "—";
                const mine = e.created_by === user?.id;
                return (
                  <div key={e.id} className="rounded-md border p-2 text-xs flex items-start gap-2">
                    <div className="flex-1">
                      <div className="font-medium">
                        {nome}{" "}
                        <span className="text-muted-foreground font-normal">
                          — {format(parseISO(e.executado_em), "dd/MM/yyyy HH:mm")}
                        </span>
                      </div>
                      {e.observacao && <div className="text-muted-foreground mt-0.5 whitespace-pre-wrap">{e.observacao}</div>}
                    </div>
                    {(mine || canEdit) && (
                      <div className="flex gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => {
                            setEditing(e);
                            setExecForm({
                              executor_id: e.executor_id,
                              executor_nome: e.executor_nome,
                              executado_em: e.executado_em?.slice(0, 16),
                              observacao: e.observacao,
                            });
                          }}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => {
                            if (confirm("Excluir registro?")) remove.mutate(e.id);
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
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

