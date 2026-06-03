import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useModulePerm, useCurrentUser } from "@/lib/permissions";
import { useObraAtual } from "@/lib/obra-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, Trash2, Check, AlertTriangle, FileDown, FileText } from "lucide-react";
import { toast } from "sonner";
import { differenceInDays, parseISO } from "date-fns";
import { exportCSV, exportPDF } from "@/lib/exports";

export const Route = createFileRoute("/_authenticated/financeiro")({ component: FinanceiroPage });

function FinanceiroPage() {
  const qc = useQueryClient();
  const { data: user } = useCurrentUser();
  const { obraId } = useObraAtual();
  const perm = useModulePerm("financeiro");
  const canEdit = perm.can_edit;
  const canDelete = perm.can_delete;

  const { data: contas = [] } = useQuery({
    queryKey: ["contas", obraId],
    queryFn: async () => {
      let q = supabase.from("contas_financeiras").select("*").order("data_vencimento");
      if (obraId) q = q.eq("obra_id", obraId);
      return (await q).data ?? [];
    },
  });
  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-fin"],
    queryFn: async () => (await supabase.from("profiles").select("id, nome")).data ?? [],
    enabled: canEdit,
  });

  const [open, setOpen] = useState(false);
  const [f, setF] = useState<any>({ tipo: "pagar", status: "pendente" });

  // Filters
  const [filtro, setFiltro] = useState({ ini: "", fim: "", tipo: "all", status: "all", categoria: "" });

  const contasFiltradas = useMemo(() => contas.filter((c: any) => {
    if (filtro.ini && c.data_vencimento < filtro.ini) return false;
    if (filtro.fim && c.data_vencimento > filtro.fim) return false;
    if (filtro.tipo !== "all" && c.tipo !== filtro.tipo) return false;
    if (filtro.status !== "all" && c.status !== filtro.status) return false;
    if (filtro.categoria && !(c.categoria ?? "").toLowerCase().includes(filtro.categoria.toLowerCase())) return false;
    return true;
  }), [contas, filtro]);

  const create = useMutation({
    mutationFn: async () => { const { error } = await supabase.from("contas_financeiras").insert({ ...f, created_by: user?.id }); if (error) throw error; },
    onSuccess: () => { toast.success("Conta criada"); qc.invalidateQueries({ queryKey: ["contas"] }); setOpen(false); setF({ tipo: "pagar", status: "pendente" }); },
    onError: (e: any) => toast.error(e.message),
  });
  const marcarPago = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("contas_financeiras").update({ status: "pago", data_pagamento: new Date().toISOString().slice(0, 10) }).eq("id", id); if (error) throw error; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contas"] }),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("contas_financeiras").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contas"] }),
  });

  const minhasContas = contasFiltradas.filter((c: any) => c.user_id === user?.id);
  const pagar = contasFiltradas.filter((c: any) => c.tipo === "pagar");
  const receber = contasFiltradas.filter((c: any) => c.tipo === "receber");

  const fluxo = useMemo(() => {
    const pagas = contasFiltradas.filter((c: any) => c.status === "pago");
    const totalPagar = pagas.filter((c: any) => c.tipo === "pagar").reduce((s: number, c: any) => s + Number(c.valor), 0);
    const totalReceber = pagas.filter((c: any) => c.tipo === "receber").reduce((s: number, c: any) => s + Number(c.valor), 0);
    const pendPagar = contasFiltradas.filter((c: any) => c.tipo === "pagar" && c.status !== "pago").reduce((s: number, c: any) => s + Number(c.valor), 0);
    const pendReceber = contasFiltradas.filter((c: any) => c.tipo === "receber" && c.status !== "pago").reduce((s: number, c: any) => s + Number(c.valor), 0);
    return { totalPagar, totalReceber, pendPagar, pendReceber, saldo: totalReceber - totalPagar };
  }, [contasFiltradas]);

  const exportContas = (kind: "csv" | "pdf") => {
    const headers = ["Vencimento", "Tipo", "Descrição", "Categoria", "Valor", "Status", "Pagamento"];
    const rows = contasFiltradas.map((c: any) => [
      c.data_vencimento, c.tipo, c.descricao, c.categoria ?? "",
      Number(c.valor).toFixed(2), c.status, c.data_pagamento ?? "",
    ]);
    kind === "csv"
      ? exportCSV(`fluxo-caixa-${new Date().toISOString().slice(0,10)}`, headers, rows)
      : exportPDF("Fluxo de caixa", headers, rows);
  };

  if (!perm.can_view) {
    return <Card className="p-8 text-center text-muted-foreground">Você não tem permissão para visualizar este módulo.</Card>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Financeiro</h1>
        <p className="text-muted-foreground">Carteira virtual, contas a pagar e a receber, fluxo de caixa.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4"><p className="text-xs text-muted-foreground">A pagar (pendente)</p><p className="text-2xl font-bold text-destructive">R$ {fluxo.pendPagar.toFixed(2)}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">A receber (pendente)</p><p className="text-2xl font-bold text-success">R$ {fluxo.pendReceber.toFixed(2)}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Saldo realizado</p><p className="text-2xl font-bold">R$ {fluxo.saldo.toFixed(2)}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Minha carteira</p><p className="text-2xl font-bold">{minhasContas.length}</p></Card>
      </div>

      <Card className="p-3">
        <div className="grid gap-2 md:grid-cols-6">
          <div><Label className="text-xs">De</Label><Input type="date" value={filtro.ini} onChange={(e) => setFiltro({ ...filtro, ini: e.target.value })} /></div>
          <div><Label className="text-xs">Até</Label><Input type="date" value={filtro.fim} onChange={(e) => setFiltro({ ...filtro, fim: e.target.value })} /></div>
          <div>
            <Label className="text-xs">Tipo</Label>
            <Select value={filtro.tipo} onValueChange={(v) => setFiltro({ ...filtro, tipo: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="pagar">A pagar</SelectItem>
                <SelectItem value="receber">A receber</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={filtro.status} onValueChange={(v) => setFiltro({ ...filtro, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="pago">Pago</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Categoria</Label><Input value={filtro.categoria} onChange={(e) => setFiltro({ ...filtro, categoria: e.target.value })} placeholder="filtrar..." /></div>
          <div className="flex items-end gap-2">
            <Button variant="outline" size="sm" onClick={() => exportContas("csv")}><FileDown className="h-4 w-4" /> CSV</Button>
            <Button variant="outline" size="sm" onClick={() => exportContas("pdf")}><FileText className="h-4 w-4" /> PDF</Button>
          </div>
        </div>
      </Card>

      {canEdit && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4" /> Nova conta</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nova conta</DialogTitle></DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="space-y-3">
              <div className="space-y-1"><Label>Descrição *</Label><Input required value={f.descricao ?? ""} onChange={(e) => setF({ ...f, descricao: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label>Tipo</Label>
                  <Select value={f.tipo} onValueChange={(v) => setF({ ...f, tipo: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pagar">A pagar</SelectItem>
                      <SelectItem value="receber">A receber</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1"><Label>Valor *</Label><Input type="number" step="0.01" required value={f.valor ?? ""} onChange={(e) => setF({ ...f, valor: e.target.value })} /></div>
                <div className="space-y-1"><Label>Vencimento *</Label><Input type="date" required value={f.data_vencimento ?? ""} onChange={(e) => setF({ ...f, data_vencimento: e.target.value })} /></div>
                <div className="space-y-1"><Label>Categoria</Label><Input value={f.categoria ?? ""} onChange={(e) => setF({ ...f, categoria: e.target.value })} /></div>
              </div>
              <div className="space-y-1"><Label>Carteira (usuário)</Label>
                <Select value={f.user_id ?? ""} onValueChange={(v) => setF({ ...f, user_id: v || null })}>
                  <SelectTrigger><SelectValue placeholder="Nenhum (geral)" /></SelectTrigger>
                  <SelectContent>{profiles.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Observações</Label><Textarea value={f.observacoes ?? ""} onChange={(e) => setF({ ...f, observacoes: e.target.value })} /></div>
              <DialogFooter><Button type="submit">Criar</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      <Tabs defaultValue="pagar">
        <TabsList>
          <TabsTrigger value="pagar">A pagar ({pagar.length})</TabsTrigger>
          <TabsTrigger value="receber">A receber ({receber.length})</TabsTrigger>
          <TabsTrigger value="minha">Minha carteira ({minhasContas.length})</TabsTrigger>
        </TabsList>
        {(["pagar", "receber", "minha"] as const).map((tab) => {
          const list = tab === "pagar" ? pagar : tab === "receber" ? receber : minhasContas;
          return (
            <TabsContent key={tab} value={tab} className="space-y-2">
              {list.map((c: any) => {
                const dias = differenceInDays(parseISO(c.data_vencimento), new Date());
                const atrasado = c.status !== "pago" && dias < 0;
                return (
                  <Card key={c.id} className="p-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{c.descricao}</p>
                      <p className="text-xs text-muted-foreground">
                        Venc: {c.data_vencimento} · R$ {Number(c.valor).toFixed(2)} · {c.categoria ?? "—"}
                        {atrasado && <span className="ml-2 text-destructive inline-flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> {Math.abs(dias)}d em atraso</span>}
                        {!atrasado && c.status !== "pago" && dias <= 7 && <span className="ml-2 text-warning">vence em {dias}d</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-1 rounded ${c.status === "pago" ? "bg-success/15 text-success" : atrasado ? "bg-destructive/15 text-destructive" : "bg-warning/15 text-warning"}`}>{c.status}</span>
                      {canEdit && c.status !== "pago" && <Button size="icon" variant="ghost" onClick={() => marcarPago.mutate(c.id)}><Check className="h-4 w-4" /></Button>}
                      {canDelete && <Button size="icon" variant="ghost" onClick={() => confirm("Excluir?") && remove.mutate(c.id)}><Trash2 className="h-4 w-4" /></Button>}
                    </div>
                  </Card>
                );
              })}
              {list.length === 0 && <Card className="p-8 text-center text-muted-foreground">Nada por aqui.</Card>}
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
