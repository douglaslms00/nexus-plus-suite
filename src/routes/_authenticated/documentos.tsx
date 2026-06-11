import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser, useModulePerm } from "@/lib/permissions";
import { useObraAtual } from "@/lib/obra-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Folder, FolderPlus, Upload, Trash2, Download, ChevronRight, ArrowLeft, FileText } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";

export const Route = createFileRoute("/_authenticated/documentos")({ component: DocumentosPage });

type Escopo = "obra" | "pessoal";

function DocumentosPage() {
  const perm = useModulePerm("documentos");
  const [escopo, setEscopo] = useState<Escopo>("obra");

  if (!perm.can_view) {
    return <Card className="p-8 text-center text-muted-foreground">Você não tem permissão para ver este módulo.</Card>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Documentos</h1>
        <p className="text-muted-foreground">Organize arquivos em pastas — compartilhados por obra ou pessoais.</p>
      </div>
      <Tabs value={escopo} onValueChange={(v) => setEscopo(v as Escopo)}>
        <TabsList>
          <TabsTrigger value="obra">Obra</TabsTrigger>
          <TabsTrigger value="pessoal">Meus documentos</TabsTrigger>
        </TabsList>
        <TabsContent value="obra"><Browser escopo="obra" canEdit={perm.can_edit} canDelete={perm.can_delete} /></TabsContent>
        <TabsContent value="pessoal"><Browser escopo="pessoal" canEdit canDelete /></TabsContent>
      </Tabs>
    </div>
  );
}

function Browser({ escopo, canEdit, canDelete }: { escopo: Escopo; canEdit: boolean; canDelete: boolean }) {
  const qc = useQueryClient();
  const { data: user } = useCurrentUser();
  const { obraId } = useObraAtual();
  const [pastaId, setPastaId] = useState<string | null>(null);

  const baseKey = escopo === "obra" ? ["docs", "obra", obraId] : ["docs", "pessoal", user?.id];

  const { data: pastas = [] } = useQuery({
    queryKey: [...baseKey, "pastas"],
    enabled: escopo === "pessoal" ? !!user?.id : !!obraId,
    queryFn: async () => {
      let q = supabase.from("documento_pastas" as any).select("*").eq("escopo", escopo);
      q = escopo === "obra" ? q.eq("obra_id", obraId!) : q.eq("user_id", user!.id);
      const { data, error } = await q.order("nome");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const { data: docs = [] } = useQuery({
    queryKey: [...baseKey, "docs", pastaId],
    enabled: escopo === "pessoal" ? !!user?.id : !!obraId,
    queryFn: async () => {
      let q = supabase.from("documentos" as any).select("*").eq("escopo", escopo);
      q = escopo === "obra" ? q.eq("obra_id", obraId!) : q.eq("user_id", user!.id);
      if (pastaId) q = q.eq("pasta_id", pastaId);
      else q = q.is("pasta_id", null);
      const { data, error } = await q.order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const breadcrumb = useMemo(() => {
    const path: any[] = [];
    let cur = pastas.find((p) => p.id === pastaId);
    while (cur) {
      path.unshift(cur);
      cur = pastas.find((p) => p.id === cur.parent_id);
    }
    return path;
  }, [pastas, pastaId]);

  const subpastas = pastas.filter((p) => (p.parent_id ?? null) === pastaId);

  const createPasta = useMutation({
    mutationFn: async (nome: string) => {
      const payload: any = {
        nome, parent_id: pastaId, escopo,
        created_by: user!.id,
        ...(escopo === "obra" ? { obra_id: obraId } : { user_id: user!.id }),
      };
      const { error } = await supabase.from("documento_pastas" as any).insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Pasta criada"); qc.invalidateQueries({ queryKey: baseKey }); },
    onError: (e: any) => toast.error(e.message),
  });

  const removePasta = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("documento_pastas" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Pasta removida"); qc.invalidateQueries({ queryKey: baseKey }); },
    onError: (e: any) => toast.error(e.message),
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const prefix = escopo === "obra"
        ? `documentos/obra/${obraId}`
        : `documentos/pessoal/${user!.id}`;
      const ext = file.name.split(".").pop();
      const path = `${prefix}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("anexos").upload(path, file, { upsert: false });
      if (upErr) throw upErr;
      const payload: any = {
        nome: file.name, pasta_id: pastaId, storage_path: path,
        mime: file.type, tamanho: file.size, escopo, created_by: user!.id,
        ...(escopo === "obra" ? { obra_id: obraId } : { user_id: user!.id }),
      };
      const { error } = await supabase.from("documentos" as any).insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Arquivo enviado"); qc.invalidateQueries({ queryKey: baseKey }); },
    onError: (e: any) => toast.error(e.message),
  });

  const removeDoc = useMutation({
    mutationFn: async (doc: any) => {
      await supabase.storage.from("anexos").remove([doc.storage_path]);
      const { error } = await supabase.from("documentos" as any).delete().eq("id", doc.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Arquivo removido"); qc.invalidateQueries({ queryKey: baseKey }); },
    onError: (e: any) => toast.error(e.message),
  });

  const downloadDoc = async (doc: any) => {
    const { data, error } = await supabase.storage.from("anexos").createSignedUrl(doc.storage_path, 3600);
    if (error) { toast.error(error.message); return; }
    window.open(data.signedUrl, "_blank");
  };

  const [novaOpen, setNovaOpen] = useState(false);
  const [novoNome, setNovoNome] = useState("");

  if (escopo === "obra" && !obraId) {
    return <Card className="p-8 text-center text-muted-foreground">Selecione uma obra no topo.</Card>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-sm flex-wrap">
          <button onClick={() => setPastaId(null)} className="text-primary hover:underline">Raiz</button>
          {breadcrumb.map((p) => (
            <span key={p.id} className="flex items-center gap-1">
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
              <button onClick={() => setPastaId(p.id)} className="text-primary hover:underline">{p.nome}</button>
            </span>
          ))}
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Dialog open={novaOpen} onOpenChange={setNovaOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm"><FolderPlus className="h-4 w-4" /> Nova pasta</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Nova pasta</DialogTitle></DialogHeader>
                <div><Label>Nome</Label><Input value={novoNome} onChange={(e) => setNovoNome(e.target.value)} /></div>
                <DialogFooter>
                  <Button onClick={() => { if (novoNome.trim()) { createPasta.mutate(novoNome.trim()); setNovoNome(""); setNovaOpen(false); } }}>Criar</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <label>
              <input type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.mutate(f); e.target.value = ""; }} />
              <Button asChild size="sm"><span><Upload className="h-4 w-4" /> Enviar arquivo</span></Button>
            </label>
          </div>
        )}
      </div>

      {pastaId && (
        <Button variant="ghost" size="sm" onClick={() => {
          const cur = pastas.find((p) => p.id === pastaId);
          setPastaId(cur?.parent_id ?? null);
        }}><ArrowLeft className="h-4 w-4" /> Voltar</Button>
      )}

      <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
        {subpastas.map((p) => (
          <Card key={p.id} className="p-3 flex items-center justify-between hover:bg-muted/30 cursor-pointer" onClick={() => setPastaId(p.id)}>
            <div className="flex items-center gap-2 min-w-0">
              <Folder className="h-5 w-5 text-primary shrink-0" />
              <span className="truncate text-sm font-medium">{p.nome}</span>
            </div>
            {canDelete && (
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); if (confirm(`Excluir pasta "${p.nome}" e todo o conteúdo?`)) removePasta.mutate(p.id); }}>
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </Card>
        ))}
      </div>

      <div className="space-y-2">
        {docs.length === 0 && subpastas.length === 0 && (
          <Card className="p-8 text-center text-muted-foreground">Pasta vazia.</Card>
        )}
        {docs.map((d) => (
          <Card key={d.id} className="p-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{d.nome}</p>
                <p className="text-xs text-muted-foreground">
                  {format(parseISO(d.created_at), "dd/MM/yyyy HH:mm")} · {((d.tamanho ?? 0) / 1024).toFixed(1)} KB
                </p>
              </div>
            </div>
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" onClick={() => downloadDoc(d)} title="Baixar"><Download className="h-4 w-4" /></Button>
              {canDelete && (
                <Button size="icon" variant="ghost" onClick={() => { if (confirm("Excluir arquivo?")) removeDoc.mutate(d); }}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
