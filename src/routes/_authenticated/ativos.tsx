import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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
import { Plus, Trash2, Wrench, ArrowRightLeft, Check, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/ativos")({ component: AtivosPage });

function AtivosPage() {
  const qc = useQueryClient();
  const { data: user } = useCurrentUser();
  const { data: roles } = useUserRoles();
  const canCreate = canManage(roles);
  const canDelete = isAdmin(roles);

  const { data: ativos = [] } = useQuery({
    queryKey: ["ativos"],
    queryFn: async () => (await supabase.from("ativos").select("*, obra:obras(nome)").order("created_at", { ascending: false })).data ?? [],
  });
  const { data: obras = [] } = useQuery({
    queryKey: ["obras-min"],
    queryFn: async () => (await supabase.from("obras").select("id, nome").order("nome")).data ?? [],
  });
  const { data: manutencoes = [] } = useQuery({
    queryKey: ["manutencoes"],
    queryFn: async () => (await supabase.from("ativo_manutencoes").select("*, ativo:ativos(nome)").order("data", { ascending: false })).data ?? [],
  });
  const { data: transferencias = [] } = useQuery({
    queryKey: ["transferencias"],
    queryFn: async () => (await supabase.from("ativo_transferencias").select("*, ativo:ativos(nome), origem:obras!ativo_transferencias_obra_origem_id_fkey(nome), destino:obras!ativo_transferencias_obra_destino_id_fkey(nome)").order("created_at", { ascending: false })).data ?? [],
  });

  const [openA, setOpenA] = useState(false);
  const [openM, setOpenM] = useState(false);
  const [openT, setOpenT] = useState(false);
  const [fA, setFA] = useState<any>({ estado: "em_uso" });
  const [fM, setFM] = useState<any>({ tipo: "preventiva" });
  const [fT, setFT] = useState<any>({});

  const createAtivo = useMutation({
    mutationFn: async () => { const { error } = await supabase.from("ativos").insert(fA); if (error) throw error; },
    onSuccess: () => { toast.success("Ativo criado"); qc.invalidateQueries({ queryKey: ["ativos"] }); setOpenA(false); setFA({ estado: "em_uso" }); },
    onError: (e: any) => toast.error(e.message),
  });
  const removeAtivo = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("ativos").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ativos"] }),
  });
  const createManut = useMutation({
    mutationFn: async () => { const { error } = await supabase.from("ativo_manutencoes").insert({ ...fM, created_by: user?.id }); if (error) throw error; },
    onSuccess: () => { toast.success("Manutenção registrada"); qc.invalidateQueries({ queryKey: ["manutencoes"] }); setOpenM(false); setFM({ tipo: "preventiva" }); },
    onError: (e: any) => toast.error(e.message),
  });
  const createTransf = useMutation({
    mutationFn: async () => { const { error } = await supabase.from("ativo_transferencias").insert({ ...fT, solicitado_por: user?.id }); if (error) throw error; },
    onSuccess: () => { toast.success("Transferência solicitada"); qc.invalidateQueries({ queryKey: ["transferencias"] }); setOpenT(false); setFT({}); },
    onError: (e: any) => toast.error(e.message),
  });
  const decidir = useMutation({
    mutationFn: async ({ id, aprovar, ativo_id, destino }: { id: string; aprovar: boolean; ativo_id: string; destino: string }) => {
      const { error } = await supabase.from("ativo_transferencias").update({
        status: aprovar ? "aprovada" : "rejeitada", aprovado_por: user?.id, decidido_em: new Date().toISOString(),
      }).eq("id", id);
      if (error) throw error;
      if (aprovar) await supabase.from("ativos").update({ obra_id: destino }).eq("id", ativo_id);
    },
    onSuccess: () => { toast.success("Decisão registrada"); qc.invalidateQueries({ queryKey: ["transferencias"] }); qc.invalidateQueries({ queryKey: ["ativos"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Ativos</h1>
        <p className="text-muted-foreground">Bens patrimoniais, manutenções e transferências.</p>
      </div>

      <Tabs defaultValue="lista">
        <TabsList>
          <TabsTrigger value="lista">Ativos</TabsTrigger>
          <TabsTrigger value="manut">Manutenções</TabsTrigger>
          <TabsTrigger value="transf">Transferências</TabsTrigger>
        </TabsList>

        <TabsContent value="lista" className="space-y-3">
          {canCreate && (
            <Dialog open={openA} onOpenChange={setOpenA}>
              <DialogTrigger asChild><Button><Plus className="h-4 w-4" /> Novo ativo</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Novo ativo</DialogTitle></DialogHeader>
                <form onSubmit={(e) => { e.preventDefault(); createAtivo.mutate(); }} className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1"><Label>Nome *</Label><Input required value={fA.nome ?? ""} onChange={(e) => setFA({ ...fA, nome: e.target.value })} /></div>
                    <div className="space-y-1"><Label>Código</Label><Input value={fA.codigo ?? ""} onChange={(e) => setFA({ ...fA, codigo: e.target.value })} /></div>
                    <div className="space-y-1"><Label>Categoria</Label><Input value={fA.categoria ?? ""} onChange={(e) => setFA({ ...fA, categoria: e.target.value })} /></div>
                    <div className="space-y-1"><Label>Valor</Label><Input type="number" step="0.01" value={fA.valor ?? ""} onChange={(e) => setFA({ ...fA, valor: e.target.value })} /></div>
                    <div className="space-y-1"><Label>Aquisição</Label><Input type="date" value={fA.data_aquisicao ?? ""} onChange={(e) => setFA({ ...fA, data_aquisicao: e.target.value })} /></div>
                    <div className="space-y-1"><Label>Estado</Label>
                      <Select value={fA.estado} onValueChange={(v) => setFA({ ...fA, estado: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="em_uso">Em uso</SelectItem>
                          <SelectItem value="estoque">Estoque</SelectItem>
                          <SelectItem value="manutencao">Manutenção</SelectItem>
                          <SelectItem value="baixado">Baixado</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1"><Label>Obra</Label>
                    <Select value={fA.obra_id ?? ""} onValueChange={(v) => setFA({ ...fA, obra_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>{obras.map((o: any) => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1"><Label>Descrição</Label><Textarea value={fA.descricao ?? ""} onChange={(e) => setFA({ ...fA, descricao: e.target.value })} /></div>
                  <DialogFooter><Button type="submit">Criar</Button></DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            {ativos.map((a: any) => (
              <Card key={a.id} className="p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-medium">{a.nome} {a.codigo && <span className="text-xs text-muted-foreground">#{a.codigo}</span>}</h3>
                    <p className="text-xs text-muted-foreground mt-1">{a.categoria} · {a.estado} · {a.obra?.nome ?? "Sem obra"}</p>
                    {a.valor && <p className="text-sm mt-1">R$ {Number(a.valor).toFixed(2)}</p>}
                  </div>
                  {canDelete && <Button size="icon" variant="ghost" onClick={() => confirm("Excluir?") && removeAtivo.mutate(a.id)}><Trash2 className="h-4 w-4" /></Button>}
                </div>
              </Card>
            ))}
            {ativos.length === 0 && <Card className="p-8 text-center text-muted-foreground md:col-span-2">Nenhum ativo cadastrado.</Card>}
          </div>
        </TabsContent>

        <TabsContent value="manut" className="space-y-3">
          {canCreate && (
            <Dialog open={openM} onOpenChange={setOpenM}>
              <DialogTrigger asChild><Button><Plus className="h-4 w-4" /> Nova manutenção</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Registrar manutenção</DialogTitle></DialogHeader>
                <form onSubmit={(e) => { e.preventDefault(); createManut.mutate(); }} className="space-y-3">
                  <div className="space-y-1"><Label>Ativo *</Label>
                    <Select value={fM.ativo_id ?? ""} onValueChange={(v) => setFM({ ...fM, ativo_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>{ativos.map((a: any) => <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1"><Label>Tipo</Label>
                      <Select value={fM.tipo} onValueChange={(v) => setFM({ ...fM, tipo: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="preventiva">Preventiva</SelectItem>
                          <SelectItem value="corretiva">Corretiva</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1"><Label>Data</Label><Input type="date" value={fM.data ?? ""} onChange={(e) => setFM({ ...fM, data: e.target.value })} /></div>
                    <div className="space-y-1"><Label>Próxima em</Label><Input type="date" value={fM.proxima_em ?? ""} onChange={(e) => setFM({ ...fM, proxima_em: e.target.value })} /></div>
                    <div className="space-y-1"><Label>Custo</Label><Input type="number" step="0.01" value={fM.custo ?? ""} onChange={(e) => setFM({ ...fM, custo: e.target.value })} /></div>
                  </div>
                  <div className="space-y-1"><Label>Descrição</Label><Textarea value={fM.descricao ?? ""} onChange={(e) => setFM({ ...fM, descricao: e.target.value })} /></div>
                  <DialogFooter><Button type="submit">Salvar</Button></DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )}
          <div className="grid gap-2">
            {manutencoes.map((m: any) => (
              <Card key={m.id} className="p-3 flex items-center justify-between">
                <div className="flex items-center gap-2"><Wrench className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{m.ativo?.nome} — {m.tipo}</p>
                    <p className="text-xs text-muted-foreground">{m.data} {m.proxima_em && `· próxima: ${m.proxima_em}`} {m.descricao && `· ${m.descricao}`}</p>
                  </div>
                </div>
                {m.custo && <span className="text-sm">R$ {Number(m.custo).toFixed(2)}</span>}
              </Card>
            ))}
            {manutencoes.length === 0 && <Card className="p-8 text-center text-muted-foreground">Nenhuma manutenção registrada.</Card>}
          </div>
        </TabsContent>

        <TabsContent value="transf" className="space-y-3">
          <Dialog open={openT} onOpenChange={setOpenT}>
            <DialogTrigger asChild><Button><ArrowRightLeft className="h-4 w-4" /> Solicitar transferência</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Transferência entre obras</DialogTitle></DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); createTransf.mutate(); }} className="space-y-3">
                <div className="space-y-1"><Label>Ativo *</Label>
                  <Select value={fT.ativo_id ?? ""} onValueChange={(v) => { const at = ativos.find((x: any) => x.id === v); setFT({ ...fT, ativo_id: v, obra_origem_id: at?.obra_id ?? null }); }}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>{ativos.map((a: any) => <SelectItem key={a.id} value={a.id}>{a.nome} ({a.obra?.nome ?? "—"})</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1"><Label>Obra destino *</Label>
                  <Select value={fT.obra_destino_id ?? ""} onValueChange={(v) => setFT({ ...fT, obra_destino_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>{obras.map((o: any) => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1"><Label>Motivo</Label><Textarea value={fT.motivo ?? ""} onChange={(e) => setFT({ ...fT, motivo: e.target.value })} /></div>
                <DialogFooter><Button type="submit">Solicitar</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
          <div className="grid gap-2">
            {transferencias.map((t: any) => (
              <Card key={t.id} className="p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{t.ativo?.nome}</p>
                    <p className="text-xs text-muted-foreground">{t.origem?.nome ?? "—"} → {t.destino?.nome} · {t.motivo}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-1 rounded ${t.status === "pendente" ? "bg-warning/15 text-warning" : t.status === "aprovada" ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}`}>{t.status}</span>
                    {t.status === "pendente" && canCreate && (
                      <>
                        <Button size="icon" variant="ghost" onClick={() => decidir.mutate({ id: t.id, aprovar: true, ativo_id: t.ativo_id, destino: t.obra_destino_id })}><Check className="h-4 w-4 text-success" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => decidir.mutate({ id: t.id, aprovar: false, ativo_id: t.ativo_id, destino: t.obra_destino_id })}><X className="h-4 w-4 text-destructive" /></Button>
                      </>
                    )}
                  </div>
                </div>
              </Card>
            ))}
            {transferencias.length === 0 && <Card className="p-8 text-center text-muted-foreground">Nenhuma transferência solicitada.</Card>}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
