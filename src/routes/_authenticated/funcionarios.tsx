import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { canManage, isAdmin, useUserRoles } from "@/lib/permissions";
import { useObraAtual } from "@/lib/obra-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { differenceInDays, parseISO, format, addMonths } from "date-fns";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/funcionarios")({
  component: FuncionariosPage,
});

const VENC: ReadonlyArray<readonly [string, string, string | null]> = [
  ["vencimento_aso", "ASO", "validade_meses_aso"],
  ["vencimento_ficha_epi", "Ficha EPI", "validade_meses_ficha_epi"],
  ["vencimento_folga_campo", "Folga Campo", "validade_meses_folga_campo"],
  ["vencimento_ferias", "Férias", "validade_meses_ferias"],
  ["vencimento_treinamento", "Treinamento", null],
] as const;

type Funcionario = any;

function vencColor(date?: string | null) {
  if (!date) return "text-muted-foreground";
  const days = differenceInDays(parseISO(date), new Date());
  if (days < 0) return "text-destructive font-semibold";
  if (days <= 30) return "text-warning font-semibold";
  return "text-success";
}

function FuncionariosPage() {
  const qc = useQueryClient();
  const { data: roles } = useUserRoles();
  const { obraId } = useObraAtual();
  const canEdit = canManage(roles);
  const canDelete = isAdmin(roles);

  const { data: funcionarios = [], isLoading } = useQuery({
    queryKey: ["funcionarios", obraId],
    queryFn: async () => {
      let q = supabase.from("funcionarios").select("*").order("nome");
      if (obraId) q = q.eq("obra_id", obraId);
      const { data, error } = await q;
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: obras = [] } = useQuery({
    queryKey: ["obras-min-func"],
    queryFn: async () => (await supabase.from("obras").select("id, nome").order("nome")).data ?? [],
  });


  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Funcionario | null>(null);
  const [form, setForm] = useState<any>({});
  const [busca, setBusca] = useState("");
  const [fStatus, setFStatus] = useState<"todos" | "ativos" | "inativos">("todos");
  const [fExp, setFExp] = useState<"todos" | "concluida" | "em_curso">("todos");
  const [fVenc, setFVenc] = useState<"todos" | "vencidos" | "proximos">("todos");

  const filtered = useMemo(() => {
    return funcionarios.filter((f: any) => {
      if (busca && !`${f.nome ?? ""} ${f.funcao ?? ""} ${f.setor ?? ""} ${f.cpf ?? ""}`.toLowerCase().includes(busca.toLowerCase())) return false;
      if (fStatus === "ativos" && !f.ativo) return false;
      if (fStatus === "inativos" && f.ativo) return false;
      if (fExp === "concluida" && !f.experiencia_concluida) return false;
      if (fExp === "em_curso" && f.experiencia_concluida) return false;
      if (fVenc !== "todos") {
        const dates = VENC.map(([k]) => f[k]).filter(Boolean) as string[];
        const hasOverdue = dates.some((d) => differenceInDays(parseISO(d), new Date()) < 0);
        const hasSoon = dates.some((d) => { const x = differenceInDays(parseISO(d), new Date()); return x >= 0 && x <= 30; });
        if (fVenc === "vencidos" && !hasOverdue) return false;
        if (fVenc === "proximos" && !hasSoon) return false;
      }
      return true;
    });
  }, [funcionarios, busca, fStatus, fExp, fVenc]);

  const openNew = () => { setEditing(null); setForm({ ativo: true, experiencia_concluida: false }); setOpen(true); };
  const openEdit = (f: Funcionario) => { setEditing(f); setForm({ ...f }); setOpen(true); };

  const upsert = useMutation({
    mutationFn: async (payload: any) => {
      const data = { ...payload };
      Object.keys(data).forEach((k) => { if (data[k] === "") data[k] = null; });
      if (editing) {
        const { error } = await supabase.from("funcionarios").update(data).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("funcionarios").insert(data);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Funcionário atualizado" : "Funcionário criado");
      qc.invalidateQueries({ queryKey: ["funcionarios"] });
      qc.invalidateQueries({ queryKey: ["dash-funcionarios"] });
      setOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("funcionarios").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Funcionário excluído");
      qc.invalidateQueries({ queryKey: ["funcionarios"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Funcionários</h1>
          <p className="text-muted-foreground">Cadastro, status de experiência e controle de vencimentos.</p>
        </div>
        {canEdit && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openNew}><Plus className="h-4 w-4" /> Novo</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editing ? "Editar funcionário" : "Novo funcionário"}</DialogTitle>
              </DialogHeader>
              <form
                onSubmit={(e) => { e.preventDefault(); upsert.mutate(form); }}
                className="grid grid-cols-2 gap-3"
              >
                <div className="col-span-2 space-y-1">
                  <Label>Nome *</Label>
                  <Input required value={form.nome ?? ""} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
                </div>
                <div className="space-y-1"><Label>CPF</Label><Input value={form.cpf ?? ""} onChange={(e) => setForm({ ...form, cpf: e.target.value })} /></div>
                <div className="space-y-1"><Label>Telefone</Label><Input value={form.telefone ?? ""} onChange={(e) => setForm({ ...form, telefone: e.target.value })} /></div>
                <div className="space-y-1"><Label>Função</Label><Input value={form.funcao ?? ""} onChange={(e) => setForm({ ...form, funcao: e.target.value })} /></div>
                <div className="space-y-1"><Label>Setor</Label><Input value={form.setor ?? ""} onChange={(e) => setForm({ ...form, setor: e.target.value })} /></div>
                <div className="space-y-1"><Label>E-mail</Label><Input type="email" value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                <div className="space-y-1"><Label>Data admissão</Label><Input type="date" value={form.data_admissao ?? ""} onChange={(e) => setForm({ ...form, data_admissao: e.target.value })} /></div>
                <div className="space-y-1">
                  <Label>Obra</Label>
                  <Select value={form.obra_id ?? ""} onValueChange={(v) => setForm({ ...form, obra_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>{obras.map((o: any) => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}</SelectContent>
                  </Select>
                </div>

                <div className="col-span-2 pt-2 border-t">
                  <p className="text-sm font-medium mb-2">Validades</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {VENC.map(([key, label, mesesKey]) => {
                      const meses = mesesKey ? (form[mesesKey] ?? "") : "";
                      const onMeses = (v: string) => {
                        if (!mesesKey) return;
                        const next: any = { ...form, [mesesKey]: v ? Number(v) : null };
                        const base = form.data_admissao ? parseISO(form.data_admissao) : new Date();
                        if (v) next[key] = format(addMonths(base, Number(v)), "yyyy-MM-dd");
                        setForm(next);
                      };
                      return (
                        <div key={key} className="rounded border p-2 space-y-1">
                          <Label className="text-xs">{label}</Label>
                          {mesesKey && (
                            <Input type="number" min={1} placeholder="meses" value={meses} onChange={(e) => onMeses(e.target.value)} />
                          )}
                          <Input type="date" value={form[key] ?? ""} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
                        </div>
                      );
                    })}
                  </div>
                </div>


                <div className="col-span-2 flex items-center gap-6 pt-2">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={!!form.experiencia_concluida} onCheckedChange={(v) => setForm({ ...form, experiencia_concluida: !!v })} />
                    Experiência concluída
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={!!form.ativo} onCheckedChange={(v) => setForm({ ...form, ativo: !!v })} />
                    Ativo
                  </label>
                </div>

                <DialogFooter className="col-span-2">
                  <Button type="submit" disabled={upsert.isPending}>{upsert.isPending ? "Salvando..." : "Salvar"}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Função / Setor</TableHead>
              <TableHead>Experiência</TableHead>
              {VENC.map(([k, l]) => <TableHead key={k}>{l}</TableHead>)}
              <TableHead className="w-24 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>}
            {!isLoading && funcionarios.length === 0 && (
              <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Nenhum funcionário cadastrado.</TableCell></TableRow>
            )}
            {funcionarios.map((f: any) => (
              <TableRow key={f.id}>
                <TableCell>
                  <div className="font-medium">{f.nome}</div>
                  <div className="text-xs text-muted-foreground">{f.email}</div>
                </TableCell>
                <TableCell>
                  <div>{f.funcao ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">{f.setor}</div>
                </TableCell>
                <TableCell>
                  <span className={cn(
                    "text-xs px-2 py-0.5 rounded",
                    f.experiencia_concluida ? "bg-success/15 text-success" : "bg-warning/15 text-warning"
                  )}>
                    {f.experiencia_concluida ? "Concluída" : "Em curso"}
                  </span>
                </TableCell>
                {VENC.map(([key]) => (
                  <TableCell key={key} className={cn("text-xs whitespace-nowrap", vencColor(f[key]))}>
                    {f[key] ? format(parseISO(f[key]), "dd/MM/yy") : "—"}
                  </TableCell>
                ))}
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    {canEdit && <Button size="icon" variant="ghost" onClick={() => openEdit(f)}><Pencil className="h-4 w-4" /></Button>}
                    {canDelete && <Button size="icon" variant="ghost" onClick={() => { if (confirm(`Excluir ${f.nome}?`)) remove.mutate(f.id); }}><Trash2 className="h-4 w-4" /></Button>}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
