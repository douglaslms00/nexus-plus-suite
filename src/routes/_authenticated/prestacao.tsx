import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser, useModulePerm } from "@/lib/permissions";
import { useObraAtual } from "@/lib/obra-context";
import { uploadAnexo, getAnexoUrl } from "@/lib/upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Receipt, Paperclip, Lock, Unlock } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/prestacao")({ component: PrestacaoPage });

const brl = (n: number) => (n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const db = supabase as any;

function PrestacaoPage() {
  const qc = useQueryClient();
  const { data: user } = useCurrentUser();
  const { obraId } = useObraAtual();
  const perm = useModulePerm("prestacao");

  const { data: adiantamentos = [] } = useQuery({
    queryKey: ["adiantamentos", obraId],
    queryFn: async () => {
      let q = db.from("adiantamentos").select("*, obra:obras(nome)").order("data", { ascending: false });
      if (obraId) q = q.eq("obra_id", obraId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: despesas = [] } = useQuery({
    queryKey: ["adiantamento-despesas"],
    queryFn: async () => {
      const { data, error } = await db.from("adiantamento_despesas").select("*").order("data", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: pessoas = [] } = useQuery({
    queryKey: ["profiles-min-prestacao"],
    queryFn: async () => (await supabase.from("profiles").select("id, nome").order("nome")).data ?? [],
  });

  const gastoPor = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of despesas as any[]) m.set(d.adiantamento_id, (m.get(d.adiantamento_id) ?? 0) + Number(d.valor ?? 0));
    return m;
  }, [despesas]);

  const totalLiberado = (adiantamentos as any[]).reduce((s, a) => s + Number(a.valor ?? 0), 0);
  const totalGasto = (adiantamentos as any[]).reduce((s, a) => s + (gastoPor.get(a.id) ?? 0), 0);
  const saldo = totalLiberado - totalGasto;

  const [openNovo, setOpenNovo] = useState(false);
  const [form, setForm] = useState<any>({ status: "aberto", data: new Date().toISOString().slice(0, 10) });
  const [detalhe, setDetalhe] = useState<any>(null);

  const criar = useMutation({
    mutationFn: async () => {
      if (!form.titulo) throw new Error("Informe um título");
      const { error } = await db.from("adiantamentos").insert({
        titulo: form.titulo,
        valor: Number(form.valor ?? 0),
        data: form.data,
        status: "aberto",
        obra_id: form.obra_id ?? obraId ?? null,
        responsavel_id: form.responsavel_id ?? user?.id ?? null,
        responsavel_nome: (pessoas as any[]).find((p) => p.id === (form.responsavel_id ?? user?.id))?.nome ?? null,
        observacoes: form.observacoes ?? null,
        created_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Adiantamento criado");
      qc.invalidateQueries({ queryKey: ["adiantamentos"] });
      setOpenNovo(false);
      setForm({ status: "aberto", data: new Date().toISOString().slice(0, 10) });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleStatus = useMutation({
    mutationFn: async (a: any) => {
      const { error } = await db.from("adiantamentos").update({ status: a.status === "aberto" ? "fechado" : "aberto" }).eq("id", a.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Status atualizado"); qc.invalidateQueries({ queryKey: ["adiantamentos"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("adiantamentos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Adiantamento excluído"); qc.invalidateQueries({ queryKey: ["adiantamentos"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const { data: obras = [] } = useQuery({
    queryKey: ["obras-min-prestacao"],
    queryFn: async () => (await supabase.from("obras").select("id, nome").order("nome")).data ?? [],
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><Receipt className="h-6 w-6" /> Prestação de contas</h1>
          <p className="text-sm text-muted-foreground">Adiantamentos, despesas com cupom fiscal e saldo a prestar.</p>
        </div>
        {perm.can_edit && (
          <Button onClick={() => setOpenNovo(true)}><Plus className="h-4 w-4 mr-1" /> Novo adiantamento</Button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs uppercase text-muted-foreground">Total liberado</p>
          <p className="text-2xl font-semibold">{brl(totalLiberado)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase text-muted-foreground">Total gasto</p>
          <p className="text-2xl font-semibold">{brl(totalGasto)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase text-muted-foreground">Saldo em aberto</p>
          <p className={cn("text-2xl font-semibold", saldo < 0 && "text-destructive")}>{brl(saldo)}</p>
        </Card>
      </div>

      <Card className="p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Adiantamento</TableHead>
              <TableHead>Responsável</TableHead>
              <TableHead>Obra</TableHead>
              <TableHead>Data</TableHead>
              <TableHead className="text-right">Liberado</TableHead>
              <TableHead className="text-right">Gasto</TableHead>
              <TableHead className="text-right">Saldo</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[140px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(adiantamentos as any[]).map((a) => {
              const gasto = gastoPor.get(a.id) ?? 0;
              const s = Number(a.valor ?? 0) - gasto;
              return (
                <TableRow key={a.id} className="cursor-pointer" onClick={() => setDetalhe(a)}>
                  <TableCell className="font-medium">{a.titulo}</TableCell>
                  <TableCell>{a.responsavel_nome ?? "—"}</TableCell>
                  <TableCell>{a.obra?.nome ?? "—"}</TableCell>
                  <TableCell>{a.data ? new Date(a.data + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</TableCell>
                  <TableCell className="text-right">{brl(Number(a.valor ?? 0))}</TableCell>
                  <TableCell className="text-right">{brl(gasto)}</TableCell>
                  <TableCell className={cn("text-right font-medium", s < 0 && "text-destructive")}>{brl(s)}</TableCell>
                  <TableCell>
                    <span className={cn("text-xs px-2 py-0.5 rounded", a.status === "aberto" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                      {a.status === "aberto" ? "Aberto" : "Fechado"}
                    </span>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-1 justify-end">
                      {perm.can_edit && (
                        <Button variant="ghost" size="icon" title={a.status === "aberto" ? "Fechar" : "Reabrir"} onClick={() => toggleStatus.mutate(a)}>
                          {a.status === "aberto" ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                        </Button>
                      )}
                      {perm.can_delete && (
                        <Button variant="ghost" size="icon" title="Excluir" onClick={() => excluir.mutate(a.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {adiantamentos.length === 0 && (
              <TableRow><TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-8">Nenhum adiantamento registrado.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={openNovo} onOpenChange={setOpenNovo}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo adiantamento</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Título</Label>
              <Input value={form.titulo ?? ""} onChange={(e) => setForm({ ...form, titulo: e.target.value })} placeholder="Ex.: Caixa 01" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Valor liberado</Label>
                <Input type="number" step="0.01" value={form.valor ?? ""} onChange={(e) => setForm({ ...form, valor: e.target.value })} />
              </div>
              <div>
                <Label>Data</Label>
                <Input type="date" value={form.data ?? ""} onChange={(e) => setForm({ ...form, data: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Responsável</Label>
              <Select value={form.responsavel_id ?? user?.id ?? ""} onValueChange={(v) => setForm({ ...form, responsavel_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {(pessoas as any[]).map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Obra</Label>
              <Select value={form.obra_id ?? obraId ?? ""} onValueChange={(v) => setForm({ ...form, obra_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {(obras as any[]).map((o) => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea value={form.observacoes ?? ""} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => criar.mutate()} disabled={criar.isPending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {detalhe && (
        <AdiantamentoDialog
          adiantamento={detalhe}
          open={!!detalhe}
          onOpenChange={(v: boolean) => !v && setDetalhe(null)}
          canEdit={perm.can_edit}
          canDelete={perm.can_delete}
        />
      )}
    </div>
  );
}

function AdiantamentoDialog({ adiantamento, open, onOpenChange, canEdit, canDelete }: any) {
  const qc = useQueryClient();
  const { data: user } = useCurrentUser();
  const [desForm, setDesForm] = useState<any>({ data: new Date().toISOString().slice(0, 10) });
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: itens = [] } = useQuery({
    queryKey: ["despesas", adiantamento.id],
    queryFn: async () => {
      const { data, error } = await db
        .from("adiantamento_despesas")
        .select("*")
        .eq("adiantamento_id", adiantamento.id)
        .order("data", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const gasto = (itens as any[]).reduce((s, d) => s + Number(d.valor ?? 0), 0);
  const saldo = Number(adiantamento.valor ?? 0) - gasto;
  const aberto = adiantamento.status === "aberto";

  const addDespesa = async () => {
    if (!desForm.descricao) return toast.error("Informe a descrição");
    setSaving(true);
    try {
      let cupom: string | null = null;
      if (file) cupom = await uploadAnexo(file, "prestacao");
      const { error } = await db.from("adiantamento_despesas").insert({
        adiantamento_id: adiantamento.id,
        descricao: desForm.descricao,
        categoria: desForm.categoria ?? null,
        valor: Number(desForm.valor ?? 0),
        data: desForm.data,
        cupom_url: cupom,
        observacoes: desForm.observacoes ?? null,
        created_by: user?.id,
      });
      if (error) throw error;
      toast.success("Despesa lançada");
      setDesForm({ data: new Date().toISOString().slice(0, 10) });
      setFile(null);
      qc.invalidateQueries({ queryKey: ["despesas", adiantamento.id] });
      qc.invalidateQueries({ queryKey: ["adiantamento-despesas"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const removeDespesa = async (id: string) => {
    const { error } = await db.from("adiantamento_despesas").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["despesas", adiantamento.id] });
    qc.invalidateQueries({ queryKey: ["adiantamento-despesas"] });
  };

  const abrirCupom = async (path: string) => {
    const url = await getAnexoUrl(path);
    if (!url) return toast.error("Não foi possível abrir o cupom");
    window.open(url, "_blank");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{adiantamento.titulo}</DialogTitle></DialogHeader>

        <div className="grid gap-3 sm:grid-cols-3">
          <Card className="p-3"><p className="text-xs text-muted-foreground">Liberado</p><p className="text-lg font-semibold">{brl(Number(adiantamento.valor ?? 0))}</p></Card>
          <Card className="p-3"><p className="text-xs text-muted-foreground">Gasto</p><p className="text-lg font-semibold">{brl(gasto)}</p></Card>
          <Card className="p-3"><p className="text-xs text-muted-foreground">A prestar</p><p className={cn("text-lg font-semibold", saldo < 0 && "text-destructive")}>{brl(saldo)}</p></Card>
        </div>

        {canEdit && aberto && (
          <div className="rounded-md border p-3 space-y-3">
            <p className="text-sm font-medium">Nova despesa</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Descrição</Label>
                <Input value={desForm.descricao ?? ""} onChange={(e) => setDesForm({ ...desForm, descricao: e.target.value })} />
              </div>
              <div>
                <Label>Categoria</Label>
                <Input value={desForm.categoria ?? ""} onChange={(e) => setDesForm({ ...desForm, categoria: e.target.value })} placeholder="Ex.: Combustível" />
              </div>
              <div>
                <Label>Valor</Label>
                <Input type="number" step="0.01" value={desForm.valor ?? ""} onChange={(e) => setDesForm({ ...desForm, valor: e.target.value })} />
              </div>
              <div>
                <Label>Data</Label>
                <Input type="date" value={desForm.data ?? ""} onChange={(e) => setDesForm({ ...desForm, data: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <Label>Cupom fiscal (foto ou PDF)</Label>
                <Input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </div>
            </div>
            <Button onClick={addDespesa} disabled={saving}><Plus className="h-4 w-4 mr-1" /> Lançar despesa</Button>
          </div>
        )}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Descrição</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Data</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead className="w-[90px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(itens as any[]).map((d) => (
              <TableRow key={d.id}>
                <TableCell>{d.descricao}</TableCell>
                <TableCell>{d.categoria ?? "—"}</TableCell>
                <TableCell>{d.data ? new Date(d.data + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</TableCell>
                <TableCell className="text-right">{brl(Number(d.valor ?? 0))}</TableCell>
                <TableCell>
                  <div className="flex gap-1 justify-end">
                    {d.cupom_url && (
                      <Button variant="ghost" size="icon" title="Ver cupom" onClick={() => abrirCupom(d.cupom_url)}>
                        <Paperclip className="h-4 w-4" />
                      </Button>
                    )}
                    {(canDelete || d.created_by === user?.id) && (
                      <Button variant="ghost" size="icon" title="Excluir" onClick={() => removeDespesa(d.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {itens.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">Nenhuma despesa lançada.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </DialogContent>
    </Dialog>
  );
}
