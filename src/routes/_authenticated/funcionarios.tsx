import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { canManage, isAdmin, useUserRoles, useModulePerm } from "@/lib/permissions";
import { useObraAtual } from "@/lib/obra-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, Pencil, FileText, Upload, Download } from "lucide-react";
import { toast } from "sonner";
import { uploadAnexo, getAnexoUrl } from "@/lib/upload";
import { differenceInDays, parseISO, format, addMonths } from "date-fns";
import { cn } from "@/lib/utils";
import { lerFichaRegistro } from "@/lib/ocr.functions";

export const Route = createFileRoute("/_authenticated/funcionarios")({
  component: FuncionariosPage,
});

const VENC: ReadonlyArray<readonly [string, string, string | null]> = [
  ["vencimento_aso", "ASO", "validade_meses_aso"],
  ["vencimento_ficha_epi", "Ficha EPI", "validade_meses_ficha_epi"],
  ["vencimento_folga_campo", "Folga Campo", "validade_meses_folga_campo"],
  ["vencimento_ferias", "Férias", "validade_meses_ferias"],
  ["vencimento_treinamento", "Treinamento", "validade_meses_treinamento"],
  ["vencimento_experiencia", "Experiência", "validade_meses_experiencia"],
] as const;

type Funcionario = any;

function vencColor(date?: string | null) {
  if (!date) return "text-muted-foreground";
  const days = differenceInDays(parseISO(date), new Date());
  if (days < 0) return "text-destructive font-semibold";
  if (days <= 30) return "text-warning font-semibold";
  return "text-success";
}

// Experiência é considerada concluída automaticamente quando passa da data de vencimento
// ou quando o flag manual experiencia_concluida está marcado.
function isExperienciaConcluida(f: any) {
  if (f?.experiencia_concluida) return true;
  if (f?.vencimento_experiencia) {
    return differenceInDays(parseISO(f.vencimento_experiencia), new Date()) < 0;
  }
  return false;
}

function FuncionariosPage() {
  const qc = useQueryClient();
  const { data: roles } = useUserRoles();
  const { obraId } = useObraAtual();
  const perm = useModulePerm("funcionarios");
  const canEdit = perm.can_edit;
  const canDelete = perm.can_delete;

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
  const [fObra, setFObra] = useState<string>("todas");
  const [fVenc, setFVenc] = useState<"todos" | "vencidos" | "proximos">("todos");
  const [docsFor, setDocsFor] = useState<Funcionario | null>(null);
  const [fichaRegistro, setFichaRegistro] = useState<File | null>(null);
  const [lendoFicha, setLendoFicha] = useState(false);

  const filtered = useMemo(() => {
    return funcionarios.filter((f: any) => {
      if (busca && !`${f.nome ?? ""} ${f.funcao ?? ""} ${f.setor ?? ""} ${f.cpf ?? ""}`.toLowerCase().includes(busca.toLowerCase())) return false;
      if (fStatus === "ativos" && !f.ativo) return false;
      if (fStatus === "inativos" && f.ativo) return false;
      if (fObra !== "todas" && f.obra_id !== fObra) return false;
      if (fVenc !== "todos") {
        const dates = VENC.map(([k]) => f[k]).filter(Boolean) as string[];
        const hasOverdue = dates.some((d) => differenceInDays(parseISO(d), new Date()) < 0);
        const hasSoon = dates.some((d) => { const x = differenceInDays(parseISO(d), new Date()); return x >= 0 && x <= 30; });
        if (fVenc === "vencidos" && !hasOverdue) return false;
        if (fVenc === "proximos" && !hasSoon) return false;
      }
      return true;
    });
  }, [funcionarios, busca, fStatus, fObra, fVenc]);

  const openNew = () => { setEditing(null); setFichaRegistro(null); setForm({ ativo: true, experiencia_concluida: false }); setOpen(true); };
  const openEdit = (f: Funcionario) => { setEditing(f); setFichaRegistro(null); setForm({ ...f }); setOpen(true); };

  const lerFicha = async (file: File) => {
    const isImagem = file.type.startsWith("image/");
    const isPdf = file.type === "application/pdf";
    if (!isImagem && !isPdf) {
      toast.error("Envie a ficha em JPG, PNG, WEBP ou PDF.");
      return;
    }
    if (file.size > (isPdf ? 50 : 5) * 1024 * 1024) {
      toast.error(isPdf ? "O PDF deve ter no máximo 50 MB." : "A imagem deve ter no máximo 5 MB.");
      return;
    }
    setFichaRegistro(file);
    if (isPdf) {
      toast.success("PDF selecionado e será anexado ao cadastro. Para preencher automaticamente, envie a ficha como imagem.");
      return;
    }
    setLendoFicha(true);
    try {
      const imageDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Não foi possível ler o arquivo"));
        reader.readAsDataURL(file);
      });
      const dados = await lerFichaRegistro({ data: { imageDataUrl } });
      setForm((atual: any) => ({ ...atual, ...Object.fromEntries(Object.entries(dados).filter(([, value]) => value)) }));
      toast.success("Ficha lida. Confira os dados antes de salvar.");
    } catch (e: any) {
      toast.error(e.message ?? "Não foi possível ler a ficha");
    } finally {
      setLendoFicha(false);
    }
  };

  const upsert = useMutation({
    mutationFn: async (payload: any) => {
      const data = { ...payload };
      Object.keys(data).forEach((k) => { if (data[k] === "") data[k] = null; });
      let funcionarioId = editing?.id;
      if (editing) {
        const { error } = await supabase.from("funcionarios").update(data).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { data: novo, error } = await supabase.from("funcionarios").insert(data).select("id").single();
        if (error) throw error;
        funcionarioId = novo.id;
      }
      if (fichaRegistro && funcionarioId) {
        const path = await uploadAnexo(fichaRegistro, `funcionarios/${funcionarioId}`);
        const user = (await supabase.auth.getUser()).data.user;
        const { error } = await (supabase as any).from("funcionario_documentos").insert({
          funcionario_id: funcionarioId, nome: fichaRegistro.name, tipo: fichaRegistro.type || null,
          storage_path: path, tamanho: fichaRegistro.size, uploaded_by: user?.id ?? null,
        });
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
                {!editing && (
                  <div className="col-span-2 rounded-lg border border-dashed p-3 space-y-2 bg-muted/20">
                    <div>
                      <Label>Ficha de registro com leitura por IA</Label>
                      <p className="text-xs text-muted-foreground mt-1">Envie uma foto/digitalização (JPG, PNG ou WEBP) para preencher os campos automaticamente, ou um PDF para anexar a ficha ao cadastro.</p>
                    </div>
                    <Input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" disabled={lendoFicha} onChange={(e) => { const file = e.target.files?.[0]; if (file) void lerFicha(file); e.target.value = ""; }} />
                    {lendoFicha && <p className="text-sm text-muted-foreground">Lendo ficha e preenchendo informações...</p>}
                    {!lendoFicha && fichaRegistro && <p className="text-sm text-success">Ficha selecionada: {fichaRegistro.name}</p>}
                  </div>
                )}
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
                <div className="col-span-2 space-y-1"><Label>Endereço</Label><Input value={form.endereco ?? ""} onChange={(e) => setForm({ ...form, endereco: e.target.value })} /></div>
                <div className="space-y-1"><Label>Cidade</Label><Input value={form.cidade ?? ""} onChange={(e) => setForm({ ...form, cidade: e.target.value })} /></div>
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

      <Card className="p-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <Input placeholder="Buscar nome, função, CPF..." value={busca} onChange={(e) => setBusca(e.target.value)} />
          <Select value={fStatus} onValueChange={(v) => setFStatus(v as any)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="ativos">Ativos</SelectItem>
              <SelectItem value="inativos">Inativos</SelectItem>
            </SelectContent>
          </Select>
          <Select value={fObra} onValueChange={(v) => setFObra(v)}>
            <SelectTrigger><SelectValue placeholder="Obra" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as obras</SelectItem>
              {obras.map((o: any) => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fVenc} onValueChange={(v) => setFVenc(v as any)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas validades</SelectItem>
              <SelectItem value="vencidos">Com vencidos</SelectItem>
              <SelectItem value="proximos">Vence em 30 dias</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="ghost" onClick={() => { setBusca(""); setFStatus("todos"); setFObra("todas"); setFVenc("todos"); }}>Limpar</Button>
        </div>
      </Card>

      <Tabs defaultValue="cadastro" className="space-y-4">
        <TabsList>
          <TabsTrigger value="cadastro">Cadastro</TabsTrigger>
          <TabsTrigger value="vencimentos">Vencimentos</TabsTrigger>
        </TabsList>
        <TabsContent value="cadastro">
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Função / Setor</TableHead>
              <TableHead>Obras</TableHead>
              <TableHead>CPF</TableHead>
              <TableHead>Data de admissão</TableHead>
              <TableHead>Telefone para contato</TableHead>
              <TableHead>Endereço</TableHead>
              <TableHead>Cidade</TableHead>
              <TableHead className="w-24 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>}
            {!isLoading && filtered.length === 0 && (
              <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Nenhum funcionário encontrado.</TableCell></TableRow>
            )}
            {filtered.map((f: any) => (
              <TableRow key={f.id}>
                <TableCell>
                  <div className="font-medium">{f.nome}</div>
                  <div className="text-xs text-muted-foreground">{f.email}</div>
                </TableCell>
                <TableCell>
                  <div>{f.funcao ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">{f.setor}</div>
                </TableCell>
                <TableCell className="text-sm">
                  {obras.find((o: any) => o.id === f.obra_id)?.nome ?? <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell>{f.cpf ?? "—"}</TableCell>
                <TableCell className="whitespace-nowrap">{f.data_admissao ? format(parseISO(f.data_admissao), "dd/MM/yyyy") : "—"}</TableCell>
                <TableCell>{f.telefone ?? "—"}</TableCell>
                <TableCell>{f.endereco ?? "—"}</TableCell>
                <TableCell>{f.cidade ?? "—"}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="icon" variant="ghost" title="Documentos" onClick={() => setDocsFor(f)}><FileText className="h-4 w-4" /></Button>
                    {canEdit && <Button size="icon" variant="ghost" title="Editar" onClick={() => openEdit(f)}><Pencil className="h-4 w-4" /></Button>}
                    {canDelete && <Button size="icon" variant="ghost" title="Excluir" onClick={() => { if (confirm(`Excluir ${f.nome}?`)) remove.mutate(f.id); }}><Trash2 className="h-4 w-4" /></Button>}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
        </TabsContent>
        <TabsContent value="vencimentos">
          <Card>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Nome</TableHead><TableHead>Função / Setor</TableHead><TableHead>Obra</TableHead>
                <TableHead>ASO</TableHead><TableHead>Férias</TableHead><TableHead>Folgas</TableHead><TableHead>Treinamentos</TableHead>
                <TableHead className="w-24 text-right">Ações</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {isLoading && <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>}
                {!isLoading && filtered.length === 0 && <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Nenhum funcionário encontrado.</TableCell></TableRow>}
                {filtered.map((f: any) => <TableRow key={f.id}>
                  <TableCell className="font-medium">{f.nome}</TableCell>
                  <TableCell><div>{f.funcao ?? "—"}</div><div className="text-xs text-muted-foreground">{f.setor ?? "—"}</div></TableCell>
                  <TableCell>{obras.find((o: any) => o.id === f.obra_id)?.nome ?? "—"}</TableCell>
                  {["vencimento_aso", "vencimento_ferias", "vencimento_folga_campo", "vencimento_treinamento"].map((key) => <TableCell key={key} className={cn("text-xs whitespace-nowrap", vencColor(f[key]))}>{f[key] ? format(parseISO(f[key]), "dd/MM/yyyy") : "—"}</TableCell>)}
                  <TableCell className="text-right"><div className="flex justify-end gap-1">
                    <Button size="icon" variant="ghost" title="Documentos" onClick={() => setDocsFor(f)}><FileText className="h-4 w-4" /></Button>
                    {canEdit && <Button size="icon" variant="ghost" title="Editar" onClick={() => openEdit(f)}><Pencil className="h-4 w-4" /></Button>}
                  </div></TableCell>
                </TableRow>)}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      <DocumentosDialog funcionario={docsFor} onClose={() => setDocsFor(null)} canEdit={canEdit} canDelete={canDelete} />
    </div>
  );
}

function DocumentosDialog({ funcionario, onClose, canEdit, canDelete }: { funcionario: any; onClose: () => void; canEdit: boolean; canDelete: boolean }) {
  const qc = useQueryClient();
  const open = !!funcionario;

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ["funcionario-documentos", funcionario?.id],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("funcionario_documentos")
        .select("*")
        .eq("funcionario_id", funcionario.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const addDoc = useMutation({
    mutationFn: async (file: File) => {
      const path = await uploadAnexo(file, `funcionarios/${funcionario.id}`);
      const user = (await supabase.auth.getUser()).data.user;
      const { error } = await (supabase as any).from("funcionario_documentos").insert({
        funcionario_id: funcionario.id,
        nome: file.name,
        tipo: file.type || null,
        storage_path: path,
        tamanho: file.size,
        uploaded_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Documento enviado"); qc.invalidateQueries({ queryKey: ["funcionario-documentos", funcionario?.id] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const delDoc = useMutation({
    mutationFn: async (doc: any) => {
      await supabase.storage.from("anexos").remove([doc.storage_path]);
      const { error } = await (supabase as any).from("funcionario_documentos").delete().eq("id", doc.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Documento removido"); qc.invalidateQueries({ queryKey: ["funcionario-documentos", funcionario?.id] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const handleDownload = async (doc: any) => {
    const url = await getAnexoUrl(doc.storage_path);
    if (url) window.open(url, "_blank");
    else toast.error("Não foi possível abrir o arquivo");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Documentos — {funcionario?.nome}</DialogTitle>
        </DialogHeader>
        {canEdit && (
          <div>
            <Label className="text-sm">Adicionar ficha / documento</Label>
            <Input type="file" onChange={(e) => { const f = e.target.files?.[0]; if (f) { addDoc.mutate(f); e.target.value = ""; } }} disabled={addDoc.isPending} />
            <p className="text-xs text-muted-foreground mt-1">PDF, imagem ou qualquer arquivo até 50MB.</p>
          </div>
        )}
        <div className="border rounded mt-2">
          {isLoading && <div className="p-4 text-sm text-muted-foreground text-center">Carregando...</div>}
          {!isLoading && docs.length === 0 && <div className="p-4 text-sm text-muted-foreground text-center">Nenhum documento ainda.</div>}
          {docs.map((d: any) => (
            <div key={d.id} className="flex items-center justify-between gap-2 p-2 border-b last:border-b-0">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <div className="text-sm truncate">{d.nome}</div>
                  <div className="text-xs text-muted-foreground">{format(parseISO(d.created_at), "dd/MM/yy HH:mm")} {d.tamanho ? `· ${Math.round(d.tamanho / 1024)} KB` : ""}</div>
                </div>
              </div>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" title="Baixar" onClick={() => handleDownload(d)}><Download className="h-4 w-4" /></Button>
                {canDelete && <Button size="icon" variant="ghost" title="Excluir" onClick={() => { if (confirm(`Excluir ${d.nome}?`)) delDoc.mutate(d); }}><Trash2 className="h-4 w-4" /></Button>}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
