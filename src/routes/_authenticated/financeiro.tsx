import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { canFinance, isAdmin, useUserRoles, useCurrentUser } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, Trash2, Check, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { differenceInDays, parseISO } from "date-fns";

export const Route = createFileRoute("/_authenticated/financeiro")({ component: FinanceiroPage });

function FinanceiroPage() {
  const qc = useQueryClient();
  const { data: user } = useCurrentUser();
  const { data: roles } = useUserRoles();
  const canEdit = canFinance(roles);
  const canDelete = isAdmin(roles);

  const { data: contas = [] } = useQuery({
    queryKey: ["contas"],
    queryFn: async () => (await supabase.from("contas_financeiras").select("*").order("data_vencimento")).data ?? [],
  });
  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-fin"],
    queryFn: async () => (await supabase.from("profiles").select("id, nome")).data ?? [],
    enabled: canEdit,
  });

  const [open, setOpen] = useState(false);
  const [f, setF] = useState<any>({ tipo: "pagar", status: "pendente" });

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

  const minhasContas = contas.filter((c: any) => c.user_id === user?.id);
  const pagar = contas.filter((c: any) => c.tipo === "pagar");
  const receber = contas.filter((c: any) => c.tipo === "receber");

  const fluxo = useMemo(() => {
    const pagas = contas.filter((c: any) => c.status === "pago");
    const totalPagar = pagas.filter((c: any) => c.tipo === "pagar").reduce((s: number, c: any) => s + Number(c.valor), 0);
    const totalReceber = pagas.filter((c: any) => c.tipo === "receber").reduce((s: number, c: any) => s + Number(c.valor), 0);
    const pendPagar = contas.filter((c: any) => c.tipo === "pagar" && c.status !== "pago").reduce((s: number, c: any) => s + Number(c.valor), 0);
    const pendReceber = contas.filter((c: any) => c.tipo === "receber" && c.status !== "pago").reduce((s: number, c: any) => s + Number(c.valor), 0);
    return { totalPagar, totalReceber, pendPagar, pendReceber, saldo: totalReceber - totalPagar };
  }, [contas]);

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
