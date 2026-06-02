import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { canManage, isAdmin, useUserRoles, useCurrentUser } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, Trash2, ArrowUp, ArrowDown, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/materiais")({ component: MateriaisPage });

function MateriaisPage() {
  const qc = useQueryClient();
  const { data: user } = useCurrentUser();
  const { data: roles } = useUserRoles();
  const canCreate = canManage(roles);
  const canDelete = isAdmin(roles);

  const { data: materiais = [] } = useQuery({
    queryKey: ["materiais"],
    queryFn: async () => (await supabase.from("materiais").select("*").order("nome")).data ?? [],
  });
  const { data: obras = [] } = useQuery({
    queryKey: ["obras-min2"],
    queryFn: async () => (await supabase.from("obras").select("id, nome").order("nome")).data ?? [],
  });
  const { data: movs = [] } = useQuery({
    queryKey: ["material-movs"],
    queryFn: async () => (await supabase.from("material_movimentos").select("*, material:materiais(nome, unidade), obra:obras(nome)").order("data", { ascending: false }).limit(200)).data ?? [],
  });

  const [openM, setOpenM] = useState(false);
  const [openMv, setOpenMv] = useState(false);
  const [fM, setFM] = useState<any>({ unidade: "un" });
  const [fMv, setFMv] = useState<any>({ tipo: "entrada" });

  const createMat = useMutation({
    mutationFn: async () => { const { error } = await supabase.from("materiais").insert(fM); if (error) throw error; },
    onSuccess: () => { toast.success("Material criado"); qc.invalidateQueries({ queryKey: ["materiais"] }); setOpenM(false); setFM({ unidade: "un" }); },
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
    movs.forEach((m: any) => {
      const k = m.material?.nome ?? "—";
      if (!map[k]) map[k] = { nome: k, saida: 0, entrada: 0 };
      if (m.tipo === "saida") map[k].saida += Number(m.quantidade);
      else map[k].entrada += Number(m.quantidade);
    });
    return Object.values(map).sort((a, b) => b.saida - a.saida).slice(0, 10);
  }, [movs]);

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
            <Dialog open={openM} onOpenChange={setOpenM}>
              <DialogTrigger asChild><Button><Plus className="h-4 w-4" /> Novo material</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Novo material</DialogTitle></DialogHeader>
                <form onSubmit={(e) => { e.preventDefault(); createMat.mutate(); }} className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1"><Label>Nome *</Label><Input required value={fM.nome ?? ""} onChange={(e) => setFM({ ...fM, nome: e.target.value })} /></div>
                    <div className="space-y-1"><Label>Código</Label><Input value={fM.codigo ?? ""} onChange={(e) => setFM({ ...fM, codigo: e.target.value })} /></div>
                    <div className="space-y-1"><Label>Unidade</Label><Input value={fM.unidade} onChange={(e) => setFM({ ...fM, unidade: e.target.value })} /></div>
                    <div className="space-y-1"><Label>Estoque mínimo</Label><Input type="number" step="0.001" value={fM.estoque_minimo ?? ""} onChange={(e) => setFM({ ...fM, estoque_minimo: e.target.value })} /></div>
                    <div className="space-y-1"><Label>Preço médio</Label><Input type="number" step="0.01" value={fM.preco_medio ?? ""} onChange={(e) => setFM({ ...fM, preco_medio: e.target.value })} /></div>
                  </div>
                  <div className="space-y-1"><Label>Descrição</Label><Textarea value={fM.descricao ?? ""} onChange={(e) => setFM({ ...fM, descricao: e.target.value })} /></div>
                  <DialogFooter><Button type="submit">Criar</Button></DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )}
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {materiais.map((m: any) => {
              const baixo = Number(m.estoque_atual) < Number(m.estoque_minimo);
              return (
                <Card key={m.id} className="p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-medium">{m.nome}</h3>
                      <p className="text-xs text-muted-foreground">{m.codigo} · {m.unidade}</p>
                      <p className={`text-sm mt-2 font-medium ${baixo ? "text-destructive" : ""}`}>
                        {Number(m.estoque_atual).toFixed(2)} {m.unidade} <span className="text-xs text-muted-foreground">/ mín {Number(m.estoque_minimo).toFixed(2)}</span>
                      </p>
                      {baixo && <p className="text-xs text-destructive flex items-center gap-1 mt-1"><AlertTriangle className="h-3 w-3" /> Abaixo do mínimo</p>}
                    </div>
                    {canDelete && <Button size="icon" variant="ghost" onClick={() => confirm("Excluir?") && removeMat.mutate(m.id)}><Trash2 className="h-4 w-4" /></Button>}
                  </div>
                </Card>
              );
            })}
            {materiais.length === 0 && <Card className="p-8 text-center text-muted-foreground md:col-span-2 lg:col-span-3">Nenhum material cadastrado.</Card>}
          </div>
        </TabsContent>

        <TabsContent value="mov" className="space-y-3">
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
          <div className="grid gap-2">
            {movs.map((m: any) => (
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
            {movs.length === 0 && <Card className="p-8 text-center text-muted-foreground">Nenhum movimento.</Card>}
          </div>
        </TabsContent>

        <TabsContent value="rel">
          <Card className="p-4">
            <h3 className="font-medium mb-3">Top 10 itens por consumo (saídas)</h3>
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
