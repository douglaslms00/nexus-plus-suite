import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUserRoles, useModulePerm, useCurrentUser } from "@/lib/permissions";
import { useObraAtual } from "@/lib/obra-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, ArrowUp, ArrowDown, AlertTriangle, FileDown, FileText, Pencil } from "lucide-react";
import { toast } from "sonner";
import { exportCSV, exportPDF } from "@/lib/exports";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/materiais")({ component: MateriaisPage });

function MateriaisPage() {
  const qc = useQueryClient();
  const { obraId } = useObraAtual();
  const { data: user } = useCurrentUser();
  useUserRoles();
  const perm = useModulePerm("materiais");
  const canCreate = perm.can_edit;
  const canDelete = perm.can_delete;

  const { data: materiais = [] } = useQuery({
    queryKey: ["materiais"],
    queryFn: async () => (await supabase.from("materiais").select("*").order("nome")).data ?? [],
  });
  const { data: obras = [] } = useQuery({
    queryKey: ["obras-min2"],
    queryFn: async () => (await supabase.from("obras").select("id, nome").order("nome")).data ?? [],
  });
  const { data: movs = [] } = useQuery({
    queryKey: ["material-movs", obraId],
    queryFn: async () => {
      let q = supabase.from("material_movimentos").select("*, material:materiais(nome, unidade), obra:obras(nome)").order("data", { ascending: false }).limit(500);
      if (obraId) q = q.eq("obra_id", obraId);
      return (await q).data ?? [];
    },
  });

  const [openM, setOpenM] = useState(false);
  const [editingM, setEditingM] = useState<any>(null);
  const [openMv, setOpenMv] = useState(false);
  const [fM, setFM] = useState<any>({ unidade: "un" });
  const [fMv, setFMv] = useState<any>({ tipo: "entrada" });

  useEffect(() => {
    if (obraId) setFMv((p: any) => ({ ...p, obra_id: p.obra_id ?? obraId }));
  }, [obraId]);

  const openNewM = () => { setEditingM(null); setFM({ unidade: "un" }); setOpenM(true); };
  const openEditM = (m: any) => { setEditingM(m); setFM({ ...m }); setOpenM(true); };

  // Filters
  const [filtro, setFiltro] = useState<{ ini: string; fim: string; tipo: string; obra: string; material: string }>({
    ini: "", fim: "", tipo: "all", obra: "all", material: "all",
  });

  const movsFiltrados = useMemo(() => {
    return movs.filter((m: any) => {
      if (filtro.ini && m.data < filtro.ini) return false;
      if (filtro.fim && m.data > filtro.fim) return false;
      if (filtro.tipo !== "all" && m.tipo !== filtro.tipo) return false;
      if (filtro.obra !== "all" && m.obra_id !== filtro.obra) return false;
      if (filtro.material !== "all" && m.material_id !== filtro.material) return false;
      return true;
    });
  }, [movs, filtro]);

  const saveMat = useMutation({
    mutationFn: async () => {
      const payload: any = { ...fM };
      delete payload.created_at; delete payload.updated_at; delete payload.id; delete payload.estoque_atual;
      Object.keys(payload).forEach((k) => { if (payload[k] === "") payload[k] = null; });
      if (editingM) {
        const { error } = await supabase.from("materiais").update(payload).eq("id", editingM.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("materiais").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success(editingM ? "Material atualizado" : "Material criado"); qc.invalidateQueries({ queryKey: ["materiais"] }); setOpenM(false); setEditingM(null); setFM({ unidade: "un" }); },
    onError: (e: any) => toast.error(e.message),
  });
  const removeMat = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("materiais").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["materiais"] }),
  });
  const createMv = useMutation({
    mutationFn: async () => { const { error } = await supabase.from("material_movimentos").insert({ ...fMv, created_by: user?.id }); if (error) throw error; },
    onSuccess: () => { toast.success("Movimento registrado"); qc.invalidateQueries({ queryKey: ["material-movs"] }); qc.invalidateQueries({ queryKey: ["materiais"] }); setOpenMv(false); setFMv({ tipo: "entrada" }); },
    onError: (e: any) => toast.error(e.message),
  });

  const consumo = useMemo(() => {
    const map: Record<string, { nome: string; saida: number; entrada: number }> = {};
    movsFiltrados.forEach((m: any) => {
      const k = m.material?.nome ?? "—";
      if (!map[k]) map[k] = { nome: k, saida: 0, entrada: 0 };
      if (m.tipo === "saida") map[k].saida += Number(m.quantidade);
      else map[k].entrada += Number(m.quantidade);
    });
    return Object.values(map).sort((a, b) => b.saida - a.saida);
  }, [movsFiltrados]);

  const exportMovs = (kind: "csv" | "pdf") => {
    const headers = ["Data", "Material", "Tipo", "Quantidade", "Unidade", "Obra", "Observações"];
    const rows = movsFiltrados.map((m: any) => [
      m.data, m.material?.nome ?? "", m.tipo, Number(m.quantidade).toFixed(3),
      m.material?.unidade ?? "", m.obra?.nome ?? "", m.observacoes ?? "",
    ]);
    kind === "csv"
      ? exportCSV(`movimentos-materiais-${new Date().toISOString().slice(0,10)}`, headers, rows)
      : exportPDF("Movimentos de materiais", headers, rows);
  };

  const exportConsumo = (kind: "csv" | "pdf") => {
    const headers = ["Material", "Entradas", "Saídas", "Saldo período"];
    const rows = consumo.map((c) => [c.nome, c.entrada.toFixed(2), c.saida.toFixed(2), (c.entrada - c.saida).toFixed(2)]);
    kind === "csv"
      ? exportCSV(`consumo-materiais-${new Date().toISOString().slice(0,10)}`, headers, rows)
      : exportPDF("Relatório de consumo de materiais", headers, rows);
  };

  if (!perm.can_view) {
    return <Card className="p-8 text-center text-muted-foreground">Você não tem permissão para visualizar este módulo.</Card>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Materiais</h1>
        <p className="text-muted-foreground">Estoque, entradas/saídas e relatórios de consumo.</p>
      </div>

      <Tabs defaultValue="cat">
        <TabsList>
          <TabsTrigger value="cat">Catálogo</TabsTrigger>
          <TabsTrigger value="mov">Movimentos</TabsTrigger>
          <TabsTrigger value="rel">Relatórios</TabsTrigger>
        </TabsList>

        <TabsContent value="cat" className="space-y-3">
          {canCreate && (
            <Dialog open={openM} onOpenChange={(v) => { setOpenM(v); if (!v) setEditingM(null); }}>
              <DialogTrigger asChild><Button onClick={openNewM}><Plus className="h-4 w-4" /> Novo material</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{editingM ? "Editar material" : "Novo material"}</DialogTitle></DialogHeader>
                <form onSubmit={(e) => { e.preventDefault(); saveMat.mutate(); }} className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1"><Label>Nome *</Label><Input required value={fM.nome ?? ""} onChange={(e) => setFM({ ...fM, nome: e.target.value })} /></div>
                    <div className="space-y-1"><Label>Código</Label><Input value={fM.codigo ?? ""} onChange={(e) => setFM({ ...fM, codigo: e.target.value })} /></div>
                    <div className="space-y-1"><Label>Unidade</Label><Input value={fM.unidade ?? "un"} onChange={(e) => setFM({ ...fM, unidade: e.target.value })} /></div>
                    <div className="space-y-1"><Label>Estoque mínimo</Label><Input type="number" step="0.001" value={fM.estoque_minimo ?? ""} onChange={(e) => setFM({ ...fM, estoque_minimo: e.target.value })} /></div>
                    <div className="space-y-1"><Label>Preço médio</Label><Input type="number" step="0.01" value={fM.preco_medio ?? ""} onChange={(e) => setFM({ ...fM, preco_medio: e.target.value })} /></div>
                  </div>
                  <div className="space-y-1"><Label>Descrição</Label><Textarea value={fM.descricao ?? ""} onChange={(e) => setFM({ ...fM, descricao: e.target.value })} /></div>
                  <DialogFooter><Button type="submit" disabled={saveMat.isPending}>{editingM ? "Salvar" : "Criar"}</Button></DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )}
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead>Unidade</TableHead>
                  <TableHead>Estoque</TableHead>
                  <TableHead>Mínimo</TableHead>
                  <TableHead>Preço médio</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {materiais.map((m: any) => {
                  const baixo = Number(m.estoque_atual) < Number(m.estoque_minimo);
                  return (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">{m.nome}</TableCell>
                      <TableCell>{m.codigo ?? "—"}</TableCell>
                      <TableCell>{m.unidade}</TableCell>
                      <TableCell className={cn(baixo && "text-destructive font-semibold")}>
                        <span className="inline-flex items-center gap-1">
                          {baixo && <AlertTriangle className="h-3 w-3" />}
                          {Number(m.estoque_atual).toFixed(2)}
                        </span>
                      </TableCell>
                      <TableCell>{Number(m.estoque_minimo).toFixed(2)}</TableCell>
                      <TableCell>{m.preco_medio != null ? Number(m.preco_medio).toFixed(2) : "—"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {canCreate && <Button size="icon" variant="ghost" onClick={() => openEditM(m)}><Pencil className="h-4 w-4" /></Button>}
                          {canDelete && <Button size="icon" variant="ghost" onClick={() => confirm("Excluir?") && removeMat.mutate(m.id)}><Trash2 className="h-4 w-4" /></Button>}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {materiais.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhum material cadastrado.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="mov" className="space-y-3">
          <div className="flex flex-wrap gap-2 items-end justify-between">
            {canCreate && (
              <Dialog open={openMv} onOpenChange={setOpenMv}>
                <DialogTrigger asChild><Button><Plus className="h-4 w-4" /> Novo movimento</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Entrada / Saída</DialogTitle></DialogHeader>
                  <form onSubmit={(e) => { e.preventDefault(); createMv.mutate(); }} className="space-y-3">
                    <div className="space-y-1"><Label>Material *</Label>
                      <Select value={fMv.material_id ?? ""} onValueChange={(v) => setFMv({ ...fMv, material_id: v })}>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>{materiais.map((m: any) => <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1"><Label>Tipo</Label>
                        <Select value={fMv.tipo} onValueChange={(v) => setFMv({ ...fMv, tipo: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="entrada">Entrada</SelectItem>
                            <SelectItem value="saida">Saída</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1"><Label>Quantidade *</Label><Input type="number" step="0.001" required value={fMv.quantidade ?? ""} onChange={(e) => setFMv({ ...fMv, quantidade: e.target.value })} /></div>
                    </div>
                    <div className="space-y-1"><Label>Obra</Label>
                      <Select value={fMv.obra_id ?? ""} onValueChange={(v) => setFMv({ ...fMv, obra_id: v })}>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>{obras.map((o: any) => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1"><Label>Observações</Label><Textarea value={fMv.observacoes ?? ""} onChange={(e) => setFMv({ ...fMv, observacoes: e.target.value })} /></div>
                    <DialogFooter><Button type="submit">Registrar</Button></DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            )}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => exportMovs("csv")}><FileDown className="h-4 w-4" /> CSV</Button>
              <Button variant="outline" size="sm" onClick={() => exportMovs("pdf")}><FileText className="h-4 w-4" /> PDF</Button>
            </div>
          </div>

          <Card className="p-3">
            <div className="grid gap-2 md:grid-cols-5">
              <div><Label className="text-xs">De</Label><Input type="date" value={filtro.ini} onChange={(e) => setFiltro({ ...filtro, ini: e.target.value })} /></div>
              <div><Label className="text-xs">Até</Label><Input type="date" value={filtro.fim} onChange={(e) => setFiltro({ ...filtro, fim: e.target.value })} /></div>
              <div>
                <Label className="text-xs">Tipo</Label>
                <Select value={filtro.tipo} onValueChange={(v) => setFiltro({ ...filtro, tipo: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="entrada">Entrada</SelectItem>
                    <SelectItem value="saida">Saída</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Obra</Label>
                <Select value={filtro.obra} onValueChange={(v) => setFiltro({ ...filtro, obra: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {obras.map((o: any) => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Material</Label>
                <Select value={filtro.material} onValueChange={(v) => setFiltro({ ...filtro, material: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {materiais.map((m: any) => <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Card>

          <div className="grid gap-2">
            {movsFiltrados.map((m: any) => (
              <Card key={m.id} className="p-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {m.tipo === "entrada" ? <ArrowDown className="h-4 w-4 text-success" /> : <ArrowUp className="h-4 w-4 text-destructive" />}
                  <div>
                    <p className="text-sm font-medium">{m.material?.nome} — {Number(m.quantidade).toFixed(2)} {m.material?.unidade}</p>
                    <p className="text-xs text-muted-foreground">{m.data} {m.obra?.nome && `· ${m.obra.nome}`} {m.observacoes && `· ${m.observacoes}`}</p>
                  </div>
                </div>
              </Card>
            ))}
            {movsFiltrados.length === 0 && <Card className="p-8 text-center text-muted-foreground">Nenhum movimento no filtro.</Card>}
          </div>
        </TabsContent>

        <TabsContent value="rel" className="space-y-3">
          <Card className="p-3">
            <div className="grid gap-2 md:grid-cols-4">
              <div><Label className="text-xs">De</Label><Input type="date" value={filtro.ini} onChange={(e) => setFiltro({ ...filtro, ini: e.target.value })} /></div>
              <div><Label className="text-xs">Até</Label><Input type="date" value={filtro.fim} onChange={(e) => setFiltro({ ...filtro, fim: e.target.value })} /></div>
              <div>
                <Label className="text-xs">Obra</Label>
                <Select value={filtro.obra} onValueChange={(v) => setFiltro({ ...filtro, obra: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {obras.map((o: any) => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-2">
                <Button variant="outline" size="sm" onClick={() => exportConsumo("csv")}><FileDown className="h-4 w-4" /> CSV</Button>
                <Button variant="outline" size="sm" onClick={() => exportConsumo("pdf")}><FileText className="h-4 w-4" /> PDF</Button>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <h3 className="font-medium mb-3">Consumo de materiais (período filtrado)</h3>
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-muted-foreground"><th className="py-2">Material</th><th>Entradas</th><th>Saídas</th><th>Saldo período</th></tr></thead>
              <tbody>
                {consumo.map((c) => (
                  <tr key={c.nome} className="border-b">
                    <td className="py-2">{c.nome}</td><td>{c.entrada.toFixed(2)}</td><td>{c.saida.toFixed(2)}</td><td>{(c.entrada - c.saida).toFixed(2)}</td>
                  </tr>
                ))}
                {consumo.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-muted-foreground">Sem dados</td></tr>}
              </tbody>
            </table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
