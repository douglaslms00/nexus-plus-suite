import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser, useModulePerm } from "@/lib/permissions";
import { RequireModulePerm } from "@/components/RequireModulePerm";
import { useObraAtual } from "@/lib/obra-context.types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, Trash2, Wrench, ArrowRightLeft, Check, X, Pencil } from "lucide-react";
import { toast } from "sonner";
import { InventoryImportExport } from "@/components/InventoryImportExport";

export const Route = createFileRoute("/_authenticated/ativos")({
  component: () => (
    <RequireModulePerm module="ativos">
      <AtivosPage />
    </RequireModulePerm>
  ),
});

function AtivosPage() {
  const qc = useQueryClient();
  const { data: user } = useCurrentUser();
  const perm = useModulePerm("ativos");
  const canCreate = perm.can_edit;
  const canDelete = perm.can_delete;
  const canImport = perm.can_import;

  const { obraId } = useObraAtual();
  const { data: ativos = [] } = useQuery({
    queryKey: ["ativos", obraId],
    enabled: perm.can_view,
    queryFn: async () => {
      let q = supabase
        .from("ativos")
        .select("*, obra:obras(nome)")
        .order("created_at", { ascending: false });
      if (obraId) q = q.eq("obra_id", obraId);
      return (await q).data ?? [];
    },
  });
  const { data: obras = [] } = useQuery({
    queryKey: ["obras-min"],
    enabled: perm.can_view,
    queryFn: async () => (await supabase.from("obras").select("id, nome").order("nome")).data ?? [],
  });
  const { data: manutencoes = [] } = useQuery({
    queryKey: ["manutencoes"],
    enabled: perm.can_view,
    queryFn: async () =>
      (
        await supabase
          .from("ativo_manutencoes")
          .select("*, ativo:ativos(nome)")
          .order("data", { ascending: false })
      ).data ?? [],
  });
  const { data: transferencias = [] } = useQuery({
    queryKey: ["transferencias"],
    enabled: perm.can_view,
    queryFn: async () =>
      (
        await supabase
          .from("ativo_transferencias")
          .select(
            "*, ativo:ativos(nome), origem:obras!ativo_transferencias_obra_origem_id_fkey(nome), destino:obras!ativo_transferencias_obra_destino_id_fkey(nome)",
          )
          .order("created_at", { ascending: false })
      ).data ?? [],
  });

  const [openA, setOpenA] = useState(false);
  const [openM, setOpenM] = useState(false);
  const [openT, setOpenT] = useState(false);
  const [fA, setFA] = useState<any>({ estado: "em_uso" });
  const [fM, setFM] = useState<any>({ tipo: "preventiva" });
  const [fT, setFT] = useState<any>({});

  const [editingAtivo, setEditingAtivo] = useState<any>(null);

  const [buscaAtivo, setBuscaAtivo] = useState("");
  const ativosFiltrados = useMemo(() => {
    const q = buscaAtivo.trim().toLowerCase();
    if (!q) return ativos as any[];
    return (ativos as any[]).filter(
      (a: any) =>
        (a.nome ?? "").toLowerCase().includes(q) ||
        (a.codigo ?? "").toLowerCase().includes(q) ||
        (a.categoria ?? "").toLowerCase().includes(q),
    );
  }, [ativos, buscaAtivo]);

  const exportAtivosSpec = useMemo(() => {
    const headers = ["Nome", "Código", "Categoria", "Estado", "Obra", "Valor (R$)", "Aquisição", "Descrição"];
    const rows = ativosFiltrados.map((a: any) => [
      a.nome ?? "",
      a.codigo ?? "",
      a.categoria ?? "",
      a.estado ?? "",
      a.obra?.nome ?? "",
      a.valor != null ? Number(a.valor).toFixed(2) : "",
      a.data_aquisicao ?? "",
      (a.descricao ?? "").replace(/\s+/g, " ").slice(0, 120),
    ]);
    const parts: string[] = [];
    if (buscaAtivo.trim()) parts.push(`Busca: "${buscaAtivo.trim()}"`);
    parts.push(`${ativosFiltrados.length} item(ns)`);
    return {
      headers,
      rows,
      filenameBase: `inventario-ativos-${new Date().toISOString().slice(0, 10)}`,
      pdfTitle: "Inventário de ativos",
      pdfSubtitle: "Filtros — " + parts.join(" | "),
    };
  }, [ativosFiltrados, buscaAtivo]);

  const openNewAtivo = () => {
    setEditingAtivo(null);
    setFA({ estado: "em_uso" });
    setOpenA(true);
  };

  const openEditAtivo = (a: any) => {
    setEditingAtivo(a);
    setFA({
      nome: a.nome ?? "",
      codigo: a.codigo ?? "",
      categoria: a.categoria ?? "",
      valor: a.valor ?? "",
      data_aquisicao: a.data_aquisicao ?? "",
      estado: a.estado ?? "em_uso",
      obra_id: a.obra_id ?? "",
      descricao: a.descricao ?? "",
    });
    setOpenA(true);
  };

  const saveAtivo = useMutation({
    mutationFn: async () => {
      const payload = { ...fA };
      delete payload.obra;
      Object.keys(payload).forEach((k) => {
        if (payload[k] === "") payload[k] = null;
      });
      if (editingAtivo) {
        const { error } = await supabase.from("ativos").update(payload).eq("id", editingAtivo.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("ativos").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingAtivo ? "Ativo atualizado" : "Ativo criado");
      qc.invalidateQueries({ queryKey: ["ativos"] });
      setOpenA(false);
      setEditingAtivo(null);
      setFA({ estado: "em_uso" });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const removeAtivo = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ativos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ativos"] }),
  });

  const removeManut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ativo_manutencoes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Manutenção removida");
      qc.invalidateQueries({ queryKey: ["manutencoes"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const removeTransf = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ativo_transferencias").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Transferência removida");
      qc.invalidateQueries({ queryKey: ["transferencias"] });
    },
    onError: (e: any) => toast.error(e.message),
  });
  const createManut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("ativo_manutencoes")
        .insert({ ...fM, created_by: user?.id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Manutenção registrada");
      qc.invalidateQueries({ queryKey: ["manutencoes"] });
      setOpenM(false);
      setFM({ tipo: "preventiva" });
    },
    onError: (e: any) => toast.error(e.message),
  });
  const createTransf = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("ativo_transferencias")
        .insert({ ...fT, solicitado_por: user?.id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Transferência solicitada");
      qc.invalidateQueries({ queryKey: ["transferencias"] });
      setOpenT(false);
      setFT({});
    },
    onError: (e: any) => toast.error(e.message),
  });
  const decidir = useMutation({
    mutationFn: async ({
      id,
      aprovar,
      ativo_id,
      destino,
    }: {
      id: string;
      aprovar: boolean;
      ativo_id: string;
      destino: string;
    }) => {
      const { error } = await supabase
        .from("ativo_transferencias")
        .update({
          status: aprovar ? "aprovada" : "rejeitada",
          aprovado_por: user?.id,
          decidido_em: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
      if (aprovar) await supabase.from("ativos").update({ obra_id: destino }).eq("id", ativo_id);
    },
    onSuccess: () => {
      toast.success("Decisão registrada");
      qc.invalidateQueries({ queryKey: ["transferencias"] });
      qc.invalidateQueries({ queryKey: ["ativos"] });
    },
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
            <Dialog open={openA} onOpenChange={(v) => { setOpenA(v); if (!v) setEditingAtivo(null); }}>
              <DialogTrigger asChild>
                <Button onClick={openNewAtivo}>
                  <Plus className="h-4 w-4" /> Novo ativo
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingAtivo ? "Editar ativo" : "Novo ativo"}</DialogTitle>
                </DialogHeader>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    saveAtivo.mutate();
                  }}
                  className="space-y-3"
                >
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Nome *</Label>
                      <Input
                        required
                        value={fA.nome ?? ""}
                        onChange={(e) => setFA({ ...fA, nome: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Código</Label>
                      <Input
                        value={fA.codigo ?? ""}
                        onChange={(e) => setFA({ ...fA, codigo: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Categoria</Label>
                      <Input
                        value={fA.categoria ?? ""}
                        onChange={(e) => setFA({ ...fA, categoria: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Valor</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={fA.valor ?? ""}
                        onChange={(e) => setFA({ ...fA, valor: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Aquisição</Label>
                      <Input
                        type="date"
                        value={fA.data_aquisicao ?? ""}
                        onChange={(e) => setFA({ ...fA, data_aquisicao: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Estado</Label>
                      <Select value={fA.estado} onValueChange={(v) => setFA({ ...fA, estado: v })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="em_uso">Em uso</SelectItem>
                          <SelectItem value="estoque">Estoque</SelectItem>
                          <SelectItem value="manutencao">Manutenção</SelectItem>
                          <SelectItem value="baixado">Baixado</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label>Obra</Label>
                    <Select
                      value={fA.obra_id ?? ""}
                      onValueChange={(v) => setFA({ ...fA, obra_id: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {obras.map((o: any) => (
                          <SelectItem key={o.id} value={o.id}>
                            {o.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Descrição</Label>
                    <Textarea
                      value={fA.descricao ?? ""}
                      onChange={(e) => setFA({ ...fA, descricao: e.target.value })}
                    />
                  </div>
                  <DialogFooter>
                    <Button type="submit">{editingAtivo ? "Salvar" : "Criar"}</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )}
          <Card className="p-3">
            <div className="grid gap-2 md:grid-cols-[1fr_auto] items-end">
              <div>
                <Label className="text-xs">Buscar (nome, código ou categoria)</Label>
                <Input
                  value={buscaAtivo}
                  onChange={(e) => setBuscaAtivo(e.target.value)}
                  placeholder="Digite para filtrar..."
                />
              </div>
              <InventoryImportExport
                kind="ativos"
                obras={obras as any[]}
                exportSpec={exportAtivosSpec}
                defaultObraId={obraId}
                canImport={canImport}
                onImported={() => qc.invalidateQueries({ queryKey: ["ativos"] })}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {ativosFiltrados.length} de {ativos.length} — a exportação e o PDF usam o filtro atual.
            </p>
          </Card>
          <div className="grid gap-3 md:grid-cols-2">
            {ativosFiltrados.map((a: any) => (
              <Card key={a.id} className="p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-medium">
                      {a.nome}{" "}
                      {a.codigo && (
                        <span className="text-xs text-muted-foreground">#{a.codigo}</span>
                      )}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      {a.categoria} · {a.estado} · {a.obra?.nome ?? "Sem obra"}
                    </p>
                    {a.valor && <p className="text-sm mt-1">R$ {Number(a.valor).toFixed(2)}</p>}
                  </div>
                  <div className="flex items-center gap-1">
                    {canCreate && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => openEditAtivo(a)}
                        title="Editar ativo"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                    {canDelete && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => confirm("Excluir?") && removeAtivo.mutate(a.id)}
                        title="Excluir ativo"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            ))}
            {ativosFiltrados.length === 0 && (
              <Card className="p-8 text-center text-muted-foreground md:col-span-2">
                {ativos.length === 0 ? "Nenhum ativo cadastrado." : "Nenhum ativo no filtro atual."}
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="manut" className="space-y-3">
          {canCreate && (
            <Dialog open={openM} onOpenChange={setOpenM}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4" /> Nova manutenção
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Registrar manutenção</DialogTitle>
                </DialogHeader>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    createManut.mutate();
                  }}
                  className="space-y-3"
                >
                  <div className="space-y-1">
                    <Label>Ativo *</Label>
                    <Select
                      value={fM.ativo_id ?? ""}
                      onValueChange={(v) => setFM({ ...fM, ativo_id: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {ativos.map((a: any) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Tipo</Label>
                      <Select value={fM.tipo} onValueChange={(v) => setFM({ ...fM, tipo: v })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="preventiva">Preventiva</SelectItem>
                          <SelectItem value="corretiva">Corretiva</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Data</Label>
                      <Input
                        type="date"
                        value={fM.data ?? ""}
                        onChange={(e) => setFM({ ...fM, data: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Próxima em</Label>
                      <Input
                        type="date"
                        value={fM.proxima_em ?? ""}
                        onChange={(e) => setFM({ ...fM, proxima_em: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Custo</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={fM.custo ?? ""}
                        onChange={(e) => setFM({ ...fM, custo: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label>Descrição</Label>
                    <Textarea
                      value={fM.descricao ?? ""}
                      onChange={(e) => setFM({ ...fM, descricao: e.target.value })}
                    />
                  </div>
                  <DialogFooter>
                    <Button type="submit">Salvar</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )}
          <div className="grid gap-2">
            {manutencoes.map((m: any) => (
              <Card key={m.id} className="p-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wrench className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">
                      {m.ativo?.nome} — {m.tipo}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {m.data} {m.proxima_em && `· próxima: ${m.proxima_em}`}{" "}
                      {m.descricao && `· ${m.descricao}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {m.custo && <span className="text-sm">R$ {Number(m.custo).toFixed(2)}</span>}
                  {canDelete && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => confirm("Excluir manutenção?") && removeManut.mutate(m.id)}
                      title="Excluir manutenção"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </Card>
            ))}
            {manutencoes.length === 0 && (
              <Card className="p-8 text-center text-muted-foreground">
                Nenhuma manutenção registrada.
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="transf" className="space-y-3">
          <Dialog open={openT} onOpenChange={setOpenT}>
            <DialogTrigger asChild>
              <Button>
                <ArrowRightLeft className="h-4 w-4" /> Solicitar transferência
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Transferência entre obras</DialogTitle>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  createTransf.mutate();
                }}
                className="space-y-3"
              >
                <div className="space-y-1">
                  <Label>Ativo *</Label>
                  <Select
                    value={fT.ativo_id ?? ""}
                    onValueChange={(v) => {
                      const at = ativos.find((x: any) => x.id === v);
                      setFT({ ...fT, ativo_id: v, obra_origem_id: at?.obra_id ?? null });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {ativos.map((a: any) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.nome} ({a.obra?.nome ?? "—"})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Obra destino *</Label>
                  <Select
                    value={fT.obra_destino_id ?? ""}
                    onValueChange={(v) => setFT({ ...fT, obra_destino_id: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {obras.map((o: any) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Motivo</Label>
                  <Textarea
                    value={fT.motivo ?? ""}
                    onChange={(e) => setFT({ ...fT, motivo: e.target.value })}
                  />
                </div>
                <DialogFooter>
                  <Button type="submit">Solicitar</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
          <div className="grid gap-2">
            {transferencias.map((t: any) => (
              <Card key={t.id} className="p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{t.ativo?.nome}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.origem?.nome ?? "—"} → {t.destino?.nome} · {t.motivo}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs px-2 py-1 rounded ${t.status === "pendente" ? "bg-warning/15 text-warning" : t.status === "aprovada" ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}`}
                    >
                      {t.status}
                    </span>
                    {t.status === "pendente" && canCreate && (
                      <>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() =>
                            decidir.mutate({
                              id: t.id,
                              aprovar: true,
                              ativo_id: t.ativo_id,
                              destino: t.obra_destino_id,
                            })
                          }
                        >
                          <Check className="h-4 w-4 text-success" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() =>
                            decidir.mutate({
                              id: t.id,
                              aprovar: false,
                              ativo_id: t.ativo_id,
                              destino: t.obra_destino_id,
                            })
                          }
                        >
                          <X className="h-4 w-4 text-destructive" />
                        </Button>
                      </>
                    )}
                    {canDelete && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => confirm("Excluir transferência?") && removeTransf.mutate(t.id)}
                        title="Excluir transferência"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            ))}
            {transferencias.length === 0 && (
              <Card className="p-8 text-center text-muted-foreground">
                Nenhuma transferência solicitada.
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
