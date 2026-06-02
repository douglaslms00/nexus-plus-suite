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
import { Plus, Trash2, AlertTriangle, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { differenceInDays, parseISO } from "date-fns";

export const Route = createFileRoute("/_authenticated/ferramentas")({ component: FerramentasPage });

function FerramentasPage() {
  const qc = useQueryClient();
  const { data: user } = useCurrentUser();
  const { data: roles } = useUserRoles();
  const canCreate = canManage(roles);
  const canDelete = isAdmin(roles);

  const { data: ferramentas = [] } = useQuery({
    queryKey: ["ferramentas"],
    queryFn: async () => (await supabase.from("ferramentas").select("*").order("nome")).data ?? [],
  });
  const { data: funcionarios = [] } = useQuery({
    queryKey: ["func-min"],
    queryFn: async () => (await supabase.from("funcionarios").select("id, nome").eq("ativo", true).order("nome")).data ?? [],
  });
  const { data: emprestimos = [] } = useQuery({
    queryKey: ["emprestimos"],
    queryFn: async () => (await supabase.from("ferramenta_emprestimos").select("*, ferramenta:ferramentas(nome), funcionario:funcionarios(nome)").order("created_at", { ascending: false })).data ?? [],
  });

  const [openF, setOpenF] = useState(false);
  const [openE, setOpenE] = useState(false);
  const [fF, setFF] = useState<any>({ estado: "disponivel" });
  const [fE, setFE] = useState<any>({});

  const createF = useMutation({
    mutationFn: async () => { const { error } = await supabase.from("ferramentas").insert(fF); if (error) throw error; },
    onSuccess: () => { toast.success("Ferramenta criada"); qc.invalidateQueries({ queryKey: ["ferramentas"] }); setOpenF(false); setFF({ estado: "disponivel" }); },
    onError: (e: any) => toast.error(e.message),
  });
  const removeF = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("ferramentas").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ferramentas"] }),
  });
  const emprestar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("ferramenta_emprestimos").insert({ ...fE, created_by: user?.id });
      if (error) throw error;
      await supabase.from("ferramentas").update({ estado: "emprestada" }).eq("id", fE.ferramenta_id);
    },
    onSuccess: () => { toast.success("Empréstimo registrado"); qc.invalidateQueries({ queryKey: ["emprestimos"] }); qc.invalidateQueries({ queryKey: ["ferramentas"] }); setOpenE(false); setFE({}); },
    onError: (e: any) => toast.error(e.message),
  });
  const devolver = useMutation({
    mutationFn: async (e: any) => {
      const { error } = await supabase.from("ferramenta_emprestimos").update({ data_devolucao: new Date().toISOString().slice(0, 10) }).eq("id", e.id);
      if (error) throw error;
      await supabase.from("ferramentas").update({ estado: "disponivel" }).eq("id", e.ferramenta_id);
    },
    onSuccess: () => { toast.success("Devolução registrada"); qc.invalidateQueries({ queryKey: ["emprestimos"] }); qc.invalidateQueries({ queryKey: ["ferramentas"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Ferramentas</h1>
        <p className="text-muted-foreground">Catálogo, empréstimos e manutenções.</p>
      </div>

      <Tabs defaultValue="cat">
        <TabsList>
          <TabsTrigger value="cat">Catálogo</TabsTrigger>
          <TabsTrigger value="emp">Empréstimos</TabsTrigger>
        </TabsList>

        <TabsContent value="cat" className="space-y-3">
          {canCreate && (
            <Dialog open={openF} onOpenChange={setOpenF}>
              <DialogTrigger asChild><Button><Plus className="h-4 w-4" /> Nova ferramenta</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Nova ferramenta</DialogTitle></DialogHeader>
                <form onSubmit={(e) => { e.preventDefault(); createF.mutate(); }} className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1"><Label>Nome *</Label><Input required value={fF.nome ?? ""} onChange={(e) => setFF({ ...fF, nome: e.target.value })} /></div>
                    <div className="space-y-1"><Label>Código</Label><Input value={fF.codigo ?? ""} onChange={(e) => setFF({ ...fF, codigo: e.target.value })} /></div>
                    <div className="space-y-1"><Label>Próx. manutenção</Label><Input type="date" value={fF.proxima_manutencao ?? ""} onChange={(e) => setFF({ ...fF, proxima_manutencao: e.target.value })} /></div>
                    <div className="space-y-1"><Label>Estado</Label>
                      <Select value={fF.estado} onValueChange={(v) => setFF({ ...fF, estado: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="disponivel">Disponível</SelectItem>
                          <SelectItem value="emprestada">Emprestada</SelectItem>
                          <SelectItem value="manutencao">Manutenção</SelectItem>
                          <SelectItem value="descartada">Descartada</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1"><Label>Descrição</Label><Textarea value={fF.descricao ?? ""} onChange={(e) => setFF({ ...fF, descricao: e.target.value })} /></div>
                  <DialogFooter><Button type="submit">Criar</Button></DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )}
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {ferramentas.map((f: any) => {
              const dias = f.proxima_manutencao ? differenceInDays(parseISO(f.proxima_manutencao), new Date()) : null;
              const alerta = dias !== null && dias <= 15;
              return (
                <Card key={f.id} className="p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-medium">{f.nome}</h3>
                      <p className="text-xs text-muted-foreground">{f.codigo} · {f.estado}</p>
                      {alerta && <p className="text-xs text-warning mt-2 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Manutenção em {dias}d</p>}
                    </div>
                    {canDelete && <Button size="icon" variant="ghost" onClick={() => confirm("Excluir?") && removeF.mutate(f.id)}><Trash2 className="h-4 w-4" /></Button>}
                  </div>
                </Card>
              );
            })}
            {ferramentas.length === 0 && <Card className="p-8 text-center text-muted-foreground md:col-span-2 lg:col-span-3">Nenhuma ferramenta cadastrada.</Card>}
          </div>
        </TabsContent>

        <TabsContent value="emp" className="space-y-3">
          {canCreate && (
            <Dialog open={openE} onOpenChange={setOpenE}>
              <DialogTrigger asChild><Button><Plus className="h-4 w-4" /> Novo empréstimo</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Registrar empréstimo</DialogTitle></DialogHeader>
                <form onSubmit={(e) => { e.preventDefault(); emprestar.mutate(); }} className="space-y-3">
                  <div className="space-y-1"><Label>Ferramenta *</Label>
                    <Select value={fE.ferramenta_id ?? ""} onValueChange={(v) => setFE({ ...fE, ferramenta_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>{ferramentas.filter((f: any) => f.estado === "disponivel").map((f: any) => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1"><Label>Colaborador *</Label>
                    <Select value={fE.funcionario_id ?? ""} onValueChange={(v) => setFE({ ...fE, funcionario_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>{funcionarios.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1"><Label>Empréstimo</Label><Input type="date" value={fE.data_emprestimo ?? ""} onChange={(e) => setFE({ ...fE, data_emprestimo: e.target.value })} /></div>
                    <div className="space-y-1"><Label>Devolução prevista</Label><Input type="date" value={fE.prevista_devolucao ?? ""} onChange={(e) => setFE({ ...fE, prevista_devolucao: e.target.value })} /></div>
                  </div>
                  <div className="space-y-1"><Label>Anexo (URL)</Label><Input placeholder="https://..." value={fE.anexo_url ?? ""} onChange={(e) => setFE({ ...fE, anexo_url: e.target.value })} /></div>
                  <div className="space-y-1"><Label>Observações</Label><Textarea value={fE.observacoes ?? ""} onChange={(e) => setFE({ ...fE, observacoes: e.target.value })} /></div>
                  <DialogFooter><Button type="submit">Registrar</Button></DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )}
          <div className="grid gap-2">
            {emprestimos.map((e: any) => (
              <Card key={e.id} className="p-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{e.ferramenta?.nome} → {e.funcionario?.nome ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">
                    Empréstimo: {e.data_emprestimo} {e.prevista_devolucao && `· prev: ${e.prevista_devolucao}`} {e.data_devolucao ? `· devolvido em ${e.data_devolucao}` : "· em aberto"}
                    {e.anexo_url && <> · <a href={e.anexo_url} target="_blank" rel="noreferrer" className="underline">anexo</a></>}
                  </p>
                </div>
                {!e.data_devolucao && canCreate && (
                  <Button size="sm" variant="outline" onClick={() => devolver.mutate(e)}><RotateCcw className="h-3 w-3" /> Devolver</Button>
                )}
              </Card>
            ))}
            {emprestimos.length === 0 && <Card className="p-8 text-center text-muted-foreground">Nenhum empréstimo.</Card>}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
