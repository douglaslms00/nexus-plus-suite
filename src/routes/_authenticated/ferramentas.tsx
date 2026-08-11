import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { canManage, isAdmin, useUserRoles, useCurrentUser, useModulePerm } from "@/lib/permissions";
import { useObraAtual } from "@/lib/obra-context";
import { uploadAnexo, getAnexoUrl } from "@/lib/upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, AlertTriangle, RotateCcw, Pencil, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { differenceInDays, parseISO } from "date-fns";

export const Route = createFileRoute("/_authenticated/ferramentas")({ component: FerramentasPage });

function FerramentasPage() {
  const qc = useQueryClient();
  const { obraId } = useObraAtual();
  const { data: user } = useCurrentUser();
  const { data: roles } = useUserRoles();
  const perm = useModulePerm("ferramentas");
  const canEdit = perm.can_edit;
  const canDelete = perm.can_delete;

  const { data: ferramentas = [] } = useQuery({
    queryKey: ["ferramentas", obraId],
    queryFn: async () => {
      let q = supabase.from("ferramentas").select("*, obra:obras(nome)").order("nome");
      if (obraId) q = q.eq("obra_id", obraId);
      return (await q).data ?? [];
    },
  });
  const { data: obras = [] } = useQuery({
    queryKey: ["obras-min-fer"],
    queryFn: async () => (await supabase.from("obras").select("id, nome").order("nome")).data ?? [],
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
  const [editing, setEditing] = useState<any>(null);
  const [openE, setOpenE] = useState(false);
  const [fF, setFF] = useState<any>({ estado: "disponivel" });
  const [fE, setFE] = useState<any>({});
  const [uploading, setUploading] = useState(false);

  const openNewF = () => { setEditing(null); setFF({ estado: "disponivel" }); setOpenF(true); };
  const openEditF = (f: any) => { setEditing(f); setFF({ ...f }); setOpenF(true); };

  const saveF = useMutation({
    mutationFn: async () => {
      const payload = { ...fF };
      delete payload.obra;
      Object.keys(payload).forEach((k) => { if (payload[k] === "") payload[k] = null; });
      if (editing) {
        const { error } = await supabase.from("ferramentas").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("ferramentas").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success(editing ? "Atualizada" : "Criada"); qc.invalidateQueries({ queryKey: ["ferramentas"] }); setOpenF(false); setEditing(null); setFF({ estado: "disponivel" }); },
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

  const onUpload = async (file: File) => {
    try {
      setUploading(true);
      const path = await uploadAnexo(file, "ferramentas");
      setFE((p: any) => ({ ...p, anexo_url: path }));
      toast.success("Anexo enviado");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setUploading(false);
    }
  };

  const openAnexo = async (path: string) => {
    const url = await getAnexoUrl(path);
    if (url) window.open(url, "_blank");
  };

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
          {canEdit && (
            <Dialog open={openF} onOpenChange={(v) => { setOpenF(v); if (!v) setEditing(null); }}>
              <DialogTrigger asChild><Button onClick={openNewF}><Plus className="h-4 w-4" /> Nova ferramenta</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{editing ? "Editar ferramenta" : "Nova ferramenta"}</DialogTitle></DialogHeader>
                <form onSubmit={(e) => { e.preventDefault(); saveF.mutate(); }} className="space-y-3">
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
                    <div className="space-y-1 col-span-2"><Label>Obra</Label>
                      <Select value={fF.obra_id ?? ""} onValueChange={(v) => setFF({ ...fF, obra_id: v })}>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>{obras.map((o: any) => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1"><Label>Descrição</Label><Textarea value={fF.descricao ?? ""} onChange={(e) => setFF({ ...fF, descricao: e.target.value })} /></div>
                  <DialogFooter><Button type="submit" disabled={saveF.isPending}>{editing ? "Salvar" : "Criar"}</Button></DialogFooter>
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
                  <TableHead>Estado</TableHead>
                  <TableHead>Obra</TableHead>
                  <TableHead>Próx. manutenção</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ferramentas.map((f: any) => {
                  const dias = f.proxima_manutencao ? differenceInDays(parseISO(f.proxima_manutencao), new Date()) : null;
                  const alerta = dias !== null && dias <= 15;
                  return (
                    <TableRow key={f.id}>
                      <TableCell className="font-medium">{f.nome}</TableCell>
                      <TableCell className="text-xs">{f.codigo ?? "—"}</TableCell>
                      <TableCell><span className="text-xs px-2 py-0.5 rounded bg-muted">{f.estado}</span></TableCell>
                      <TableCell className="text-xs">{f.obra?.nome ?? "—"}</TableCell>
                      <TableCell className="text-xs">
                        {f.proxima_manutencao ?? "—"}
                        {alerta && <span className="ml-1 text-warning inline-flex items-center gap-1"><AlertTriangle className="h-3 w-3" />{dias}d</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {canEdit && <Button size="icon" variant="ghost" onClick={() => openEditF(f)}><Pencil className="h-4 w-4" /></Button>}
                          {canDelete && <Button size="icon" variant="ghost" onClick={() => confirm("Excluir?") && removeF.mutate(f.id)}><Trash2 className="h-4 w-4" /></Button>}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {ferramentas.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhuma ferramenta cadastrada.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="emp" className="space-y-3">
          {canEdit && (
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
                  <div className="space-y-1">
                    <Label>Anexo (arquivo)</Label>
                    <Input type="file" disabled={uploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); }} />
                    {fE.anexo_url && <p className="text-xs text-success">✓ anexo carregado</p>}
                  </div>
                  <div className="space-y-1"><Label>Observações</Label><Textarea value={fE.observacoes ?? ""} onChange={(e) => setFE({ ...fE, observacoes: e.target.value })} /></div>
                  <DialogFooter><Button type="submit" disabled={emprestar.isPending}>Registrar</Button></DialogFooter>
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
                  </p>
                </div>
                <div className="flex gap-1">
                  {e.anexo_url && (
                    <Button size="icon" variant="ghost" onClick={() => openAnexo(e.anexo_url)} title="Ver anexo"><Paperclip className="h-4 w-4" /></Button>
                  )}
                  {!e.data_devolucao && canEdit && (
                    <Button size="sm" variant="outline" onClick={() => devolver.mutate(e)}><RotateCcw className="h-3 w-3" /> Devolver</Button>
                  )}
                </div>
              </Card>
            ))}
            {emprestimos.length === 0 && <Card className="p-8 text-center text-muted-foreground">Nenhum empréstimo.</Card>}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
