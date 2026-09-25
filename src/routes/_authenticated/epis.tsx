import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useModulePerm } from "@/lib/permissions";
import { useObraAtual } from "@/lib/obra-context.types";
import { RequireModulePerm } from "@/components/RequireModulePerm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Plus,
  Trash2,
  ArrowDownToLine,
  ArrowUpFromLine,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { InventoryImportExport } from "@/components/InventoryImportExport";
import { DataPagination, usePagination } from "@/components/DataPagination";

export const Route = createFileRoute("/_authenticated/epis")({
  component: () => (
    <RequireModulePerm module="epis">
      <EpisPage />
    </RequireModulePerm>
  ),
});

function EpisPage() {
  const qc = useQueryClient();
  const perm = useModulePerm("epis");
  const canEdit = perm.can_edit;
  const canDelete = perm.can_delete;
  const canImport = perm.can_import;
  const { obraId } = useObraAtual();

  const { data: obras = [] } = useQuery({
    queryKey: ["obras-min-epi"],
    enabled: perm.can_view,
    queryFn: async () => (await supabase.from("obras").select("id, nome").order("nome")).data ?? [],
  });
  const obraNome = (id: string | null | undefined) =>
    (obras as any[]).find((o: any) => o.id === id)?.nome ?? "Geral";

  const { data: epis = [] } = useQuery({
    queryKey: ["epis", obraId],
    enabled: perm.can_view,
    queryFn: async () => {
      let q = supabase.from("epis").select("*").order("nome").limit(5000);
      if (obraId) q = q.eq("obra_id", obraId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const { data: movs = [] } = useQuery({
    queryKey: ["epi_movs", obraId],
    enabled: perm.can_view,
    queryFn: async () => {
      let q = supabase
        .from("epi_movimentos")
        .select("*, epis(nome,tipo), funcionarios(nome)")
        .order("data_movimento", { ascending: false })
        .limit(2000);
      if (obraId) q = q.eq("obra_id", obraId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const { data: funcionarios = [] } = useQuery({
    queryKey: ["funcionarios-min"],
    enabled: perm.can_view,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("funcionarios")
        .select("id, nome")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return data;
    },
  });

  // EPI item dialog state
  const [open, setOpen] = useState(false);
  const [editingEpi, setEditingEpi] = useState<any>(null);
  const [form, setForm] = useState<any>({ tipo: "EPI", estoque_atual: 0, estoque_minimo: 0 });

  // Filters — inventário (valem também para impressão/PDF)
  const [busca, setBusca] = useState(() => {
    if (typeof window !== "undefined") return new URLSearchParams(window.location.search).get("busca") || "";
    return "";
  });
  const [estoqueInv, setEstoqueInv] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search);
      if (p.get("soBaixo") === "true") return "baixo";
      return p.get("estoque") || "all";
    }
    return "all";
  });
  const [tipoInv, setTipoInv] = useState("all");
  const [obraInv, setObraInv] = useState("all");

  const episFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (epis as any[]).filter((e: any) => {
      const est = Number(e.estoque_atual) || 0;
      if (estoqueInv === "com_estoque" && !(est > 0)) return false;
      if (estoqueInv === "acima_1" && !(est > 1)) return false;
      if (estoqueInv === "zerado" && !(est <= 0)) return false;
      if (estoqueInv === "baixo" && !(est < Number(e.estoque_minimo))) return false;
      if (tipoInv !== "all" && String(e.tipo ?? "") !== tipoInv) return false;
      if (obraInv !== "all") {
        if (obraInv === "__geral") {
          if ((e as any).obra_id) return false;
        } else if ((e as any).obra_id !== obraInv) return false;
      }
      if (!q) return true;
      return (e.nome ?? "").toLowerCase().includes(q) || (e.ca ?? "").toLowerCase().includes(q);
    });
  }, [epis, busca, estoqueInv, tipoInv, obraInv]);

  const pagEpis = usePagination(episFiltrados, {
    key: "epis",
    resetKey: `${busca}|${estoqueInv}|${tipoInv}|${obraInv}`,
  });

  const estoqueEpiLabel: Record<string, string> = {
    all: "Todos",
    com_estoque: "Com estoque (> 0)",
    acima_1: "Acima de 1 unidade (> 1)",
    zerado: "Zerados (= 0)",
    baixo: "Abaixo do mínimo",
  };

  const exportInventarioEpiSpec = useMemo(() => {
    const headers = ["Nome", "Tipo", "CA", "Obra", "Estoque", "Mínimo", "Validade (meses)"];
    const rows = episFiltrados.map((e: any) => [
      e.nome ?? "",
      e.tipo ?? "",
      e.ca ?? "",
      obraNome((e as any).obra_id),
      String(e.estoque_atual ?? 0),
      String(e.estoque_minimo ?? 0),
      e.validade_meses != null ? String(e.validade_meses) : "",
    ]);
    const parts: string[] = [];
    if (busca.trim()) parts.push(`Busca: "${busca.trim()}"`);
    parts.push(`Estoque: ${estoqueEpiLabel[estoqueInv] ?? estoqueInv}`);
    parts.push(`Tipo: ${tipoInv === "all" ? "Todos (EPI + EPC)" : tipoInv}`);
    if (obraInv !== "all") parts.push(`Obra: ${obraInv === "__geral" ? "Geral" : obraNome(obraInv)}`);
    parts.push(`${episFiltrados.length} item(ns)`);
    return {
      headers,
      rows,
      filenameBase: `inventario-epis-${new Date().toISOString().slice(0, 10)}`,
      pdfTitle: "Inventário de EPI / EPC",
      pdfSubtitle: "Filtros — " + parts.join(" | "),
    };
  }, [episFiltrados, obras, busca, estoqueInv, tipoInv, obraInv]);

  const pagMovsEpi = usePagination(movs as any[], {
    key: "epis-movs",
    resetKey: String((movs as any[]).length),
  });

  const handleNewEpi = () => {
    setEditingEpi(null);
    setForm({ tipo: "EPI", estoque_atual: 0, estoque_minimo: 0, nome: "", ca: "", validade_meses: "", obra_id: obraId ?? "" });
    setOpen(true);
  };

  const handleEditEpi = (epi: any) => {
    setEditingEpi(epi);
    setForm({
      nome: epi.nome ?? "",
      tipo: epi.tipo ?? "EPI",
      ca: epi.ca ?? "",
      estoque_atual: epi.estoque_atual ?? 0,
      estoque_minimo: epi.estoque_minimo ?? 0,
      validade_meses: epi.validade_meses ?? "",
      obra_id: (epi as any).obra_id ?? "",
    });
    setOpen(true);
  };

  const saveEpi = useMutation({
    mutationFn: async () => {
      const payload = {
        nome: form.nome,
        tipo: form.tipo,
        ca: form.ca || null,
        estoque_atual: Number(form.estoque_atual) || 0,
        estoque_minimo: Number(form.estoque_minimo) || 0,
        validade_meses: form.validade_meses ? Number(form.validade_meses) : null,
        obra_id: form.obra_id || null,
      };

      if (editingEpi) {
        const { error } = await supabase.from("epis").update(payload).eq("id", editingEpi.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("epis").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingEpi ? "EPI atualizado com sucesso" : "EPI cadastrado com sucesso");
      qc.invalidateQueries({ queryKey: ["epis"] });
      qc.invalidateQueries({ queryKey: ["dash-epis"] });
      setOpen(false);
      setEditingEpi(null);
      setForm({ tipo: "EPI", estoque_atual: 0, estoque_minimo: 0 });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const removeEpi = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("epis").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("EPI removido");
      qc.invalidateQueries({ queryKey: ["epis"] });
      qc.invalidateQueries({ queryKey: ["dash-epis"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Movement dialog state
  const [movOpen, setMovOpen] = useState(false);
  const [editingMov, setEditingMov] = useState<any>(null);
  const [movForm, setMovForm] = useState<any>({ tipo: "entrada", quantidade: 1 });

  const handleNewMov = () => {
    setEditingMov(null);
    const firstEpi = (epis as any[])[0];
    setMovForm({ tipo: "entrada", quantidade: 1, epi_id: firstEpi?.id ?? "", funcionario_id: "", motivo_retirada: "", observacoes: "", obra_id: (firstEpi as any)?.obra_id ?? obraId ?? "" });
    setMovOpen(true);
  };

  const handleEditMov = (mov: any) => {
    setEditingMov(mov);
    setMovForm({
      epi_id: mov.epi_id,
      tipo: mov.tipo,
      quantidade: mov.quantidade,
      funcionario_id: mov.funcionario_id ?? "",
      motivo_retirada: mov.motivo_retirada ?? "",
      observacoes: mov.observacoes ?? "",
      obra_id: mov.obra_id ?? "",
    });
    setMovOpen(true);
  };

  const saveMov = useMutation({
    mutationFn: async () => {
      const qtd = Number(movForm.quantidade) || 1;

      if (editingMov) {
        // Quantidade antiga e nova
        const oldDelta = (editingMov.tipo === "entrada" || editingMov.tipo === "devolucao") ? Number(editingMov.quantidade) : -Number(editingMov.quantidade);
        const newDelta = (movForm.tipo === "entrada" || movForm.tipo === "devolucao") ? qtd : -qtd;

        const { error } = await supabase
          .from("epi_movimentos")
          .update({
            epi_id: movForm.epi_id,
            funcionario_id: movForm.funcionario_id || null,
            tipo: movForm.tipo,
            quantidade: qtd,
            observacoes: movForm.observacoes || null,
            motivo_retirada: movForm.motivo_retirada || null,
            obra_id: movForm.obra_id || null,
          })
          .eq("id", editingMov.id);

        if (error) throw error;

        if (editingMov.epi_id === movForm.epi_id) {
          const epi = epis.find((e: any) => e.id === movForm.epi_id);
          if (epi) {
            const netChange = newDelta - oldDelta;
            const newStock = Math.max(0, (Number(epi.estoque_atual) || 0) + netChange);
            const { error: err2 } = await supabase
              .from("epis")
              .update({ estoque_atual: newStock })
              .eq("id", epi.id);
            if (err2) throw err2;
          }
        } else {
          // Revert old EPI
          const oldEpi = epis.find((e: any) => e.id === editingMov.epi_id);
          if (oldEpi) {
            const revertedStock = Math.max(0, (Number(oldEpi.estoque_atual) || 0) - oldDelta);
            await supabase.from("epis").update({ estoque_atual: revertedStock }).eq("id", oldEpi.id);
          }
          // Apply new EPI
          const newEpi = epis.find((e: any) => e.id === movForm.epi_id);
          if (newEpi) {
            const addedStock = Math.max(0, (Number(newEpi.estoque_atual) || 0) + newDelta);
            await supabase.from("epis").update({ estoque_atual: addedStock }).eq("id", newEpi.id);
          }
        }
      } else {
        const { error } = await supabase.from("epi_movimentos").insert({
          epi_id: movForm.epi_id,
          funcionario_id: movForm.funcionario_id || null,
          tipo: movForm.tipo,
          quantidade: qtd,
          data_vencimento: null,
          observacoes: movForm.observacoes || null,
          motivo_retirada: movForm.motivo_retirada || null,
          obra_id: movForm.obra_id || (epis as any[]).find((e: any) => e.id === movForm.epi_id)?.obra_id || obraId || null,
        });
        if (error) throw error;

        // Atualiza estoque
        const epi = epis.find((e: any) => e.id === movForm.epi_id);
        if (epi) {
          const delta = movForm.tipo === "entrada" || movForm.tipo === "devolucao" ? qtd : -qtd;
          const { error: err2 } = await supabase
            .from("epis")
            .update({ estoque_atual: Math.max(0, (Number(epi.estoque_atual) || 0) + delta) })
            .eq("id", epi.id);
          if (err2) throw err2;
        }
      }
    },
    onSuccess: () => {
      toast.success(editingMov ? "Movimentação atualizada" : "Movimentação registrada");
      qc.invalidateQueries({ queryKey: ["epis"] });
      qc.invalidateQueries({ queryKey: ["epi_movs"] });
      qc.invalidateQueries({ queryKey: ["dash-epis"] });
      setMovOpen(false);
      setEditingMov(null);
      setMovForm({ tipo: "entrada", quantidade: 1 });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const removeMov = useMutation({
    mutationFn: async (mov: any) => {
      const oldDelta = (mov.tipo === "entrada" || mov.tipo === "devolucao") ? Number(mov.quantidade) : -Number(mov.quantidade);
      const { error } = await supabase.from("epi_movimentos").delete().eq("id", mov.id);
      if (error) throw error;

      const epi = epis.find((e: any) => e.id === mov.epi_id);
      if (epi) {
        const newStock = Math.max(0, (Number(epi.estoque_atual) || 0) - oldDelta);
        await supabase.from("epis").update({ estoque_atual: newStock }).eq("id", epi.id);
      }
    },
    onSuccess: () => {
      toast.success("Movimentação removida e estoque reajustado");
      qc.invalidateQueries({ queryKey: ["epis"] });
      qc.invalidateQueries({ queryKey: ["epi_movs"] });
      qc.invalidateQueries({ queryKey: ["dash-epis"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">EPI / EPC</h1>
          <p className="text-muted-foreground">
            Cadastro de equipamentos, controle de entrega e estoque.
          </p>
        </div>
        <div className="flex gap-2">
          {canEdit && (
            <>
              <Button variant="outline" onClick={handleNewMov}>
                <ArrowDownToLine className="h-4 w-4" /> Movimentar
              </Button>

              <Button onClick={handleNewEpi}>
                <Plus className="h-4 w-4" /> Novo EPI
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Modal EPI / EPC Item */}
      <Dialog open={open} onOpenChange={(v) => {
        setOpen(v);
        if (!v) setEditingEpi(null);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingEpi ? "Editar EPI / EPC" : "Cadastrar EPI / EPC"}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveEpi.mutate();
            }}
            className="space-y-3"
          >
            <div className="space-y-1">
              <Label>Nome *</Label>
              <Input
                required
                value={form.nome ?? ""}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Tipo</Label>
                <Select
                  value={form.tipo}
                  onValueChange={(v) => setForm({ ...form, tipo: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EPI">EPI (Individual)</SelectItem>
                    <SelectItem value="EPC">EPC (Coletivo)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>CA</Label>
                <Input
                  value={form.ca ?? ""}
                  onChange={(e) => setForm({ ...form, ca: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Obra (inventário)</Label>
              <Select
                value={form.obra_id ?? ""}
                onValueChange={(v) => setForm({ ...form, obra_id: v === "__geral" ? "" : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Geral (todas as obras)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__geral">Geral (todas as obras)</SelectItem>
                  {(obras as any[]).map((o: any) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Estoque atual</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.estoque_atual}
                  onChange={(e) => setForm({ ...form, estoque_atual: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Mínimo</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.estoque_minimo}
                  onChange={(e) => setForm({ ...form, estoque_minimo: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Validade (meses)</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.validade_meses ?? ""}
                  onChange={(e) => setForm({ ...form, validade_meses: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={saveEpi.isPending}>
                {editingEpi ? "Atualizar" : "Salvar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal Movimentação */}
      <Dialog open={movOpen} onOpenChange={(v) => {
        setMovOpen(v);
        if (!v) setEditingMov(null);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingMov ? "Editar Movimentação" : "Movimentação de EPI"}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveMov.mutate();
            }}
            className="space-y-3"
          >
            <div className="space-y-1">
              <Label>EPI / EPC *</Label>
              <Select
                value={movForm.epi_id ?? ""}
                onValueChange={(v) => {
                  const epi = (epis as any[]).find((e: any) => e.id === v);
                  setMovForm({
                    ...movForm,
                    epi_id: v,
                    obra_id: (epi as any)?.obra_id ?? movForm.obra_id ?? obraId ?? "",
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {epis.map((e: any) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.nome} ({e.tipo})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Obra</Label>
              <Select
                value={movForm.obra_id ?? ""}
                onValueChange={(v) => setMovForm({ ...movForm, obra_id: v === "__geral" ? "" : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Geral (todas as obras)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__geral">Geral (todas as obras)</SelectItem>
                  {(obras as any[]).map((o: any) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Tipo</Label>
                <Select
                  value={movForm.tipo}
                  onValueChange={(v) => setMovForm({ ...movForm, tipo: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="entrada">Entrada (estoque)</SelectItem>
                    <SelectItem value="saida">Saída / Entrega</SelectItem>
                    <SelectItem value="devolucao">Devolução</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Quantidade</Label>
                <Input
                  type="number"
                  min={1}
                  value={movForm.quantidade}
                  onChange={(e) => setMovForm({ ...movForm, quantidade: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Funcionário (entrega/devolução)</Label>
              <Select
                value={movForm.funcionario_id ?? ""}
                onValueChange={(v) => setMovForm({ ...movForm, funcionario_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Opcional" />
                </SelectTrigger>
                <SelectContent>
                  {funcionarios.map((f: any) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Motivo da retirada</Label>
              <Select
                value={movForm.motivo_retirada ?? ""}
                onValueChange={(v) => setMovForm({ ...movForm, motivo_retirada: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="troca">Troca</SelectItem>
                  <SelectItem value="aquisicao_novo">Aquisição (novo)</SelectItem>
                  <SelectItem value="reposicao">Reposição</SelectItem>
                  <SelectItem value="descarte">Descarte</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Observações</Label>
              <Input
                value={movForm.observacoes ?? ""}
                onChange={(e) => setMovForm({ ...movForm, observacoes: e.target.value })}
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={saveMov.isPending}>
                {editingMov ? "Atualizar" : "Registrar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Tabs defaultValue="catalogo">
        <TabsList>
          <TabsTrigger value="catalogo">Catálogo</TabsTrigger>
          <TabsTrigger value="movs">Histórico de movimentações</TabsTrigger>
        </TabsList>
        <TabsContent value="catalogo" className="space-y-4">
          <Card className="p-3">
            <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-5 items-end">
              <div className="lg:col-span-2">
                <Label className="text-xs">Buscar (nome ou CA)</Label>
                <Input
                  placeholder="Buscar por nome ou CA..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">Estoque (impressão)</Label>
                <Select value={estoqueInv} onValueChange={setEstoqueInv}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="com_estoque">Com estoque (&gt; 0)</SelectItem>
                    <SelectItem value="acima_1">Acima de 1 (&gt; 1)</SelectItem>
                    <SelectItem value="zerado">Zerados (= 0)</SelectItem>
                    <SelectItem value="baixo">Abaixo do mínimo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Tipo</Label>
                <Select value={tipoInv} onValueChange={setTipoInv}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">EPI + EPC</SelectItem>
                    <SelectItem value="EPI">Só EPI</SelectItem>
                    <SelectItem value="EPC">Só EPC</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Obra</Label>
                <Select value={obraInv} onValueChange={setObraInv}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    <SelectItem value="__geral">Geral</SelectItem>
                    {(obras as any[]).map((o: any) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 items-center mt-3">
              <InventoryImportExport
                kind="epis"
                obras={obras as any[]}
                exportSpec={exportInventarioEpiSpec}
                defaultObraId={obraId}
                canImport={canImport}
                onImported={() => {
                  qc.invalidateQueries({ queryKey: ["epis"] });
                  qc.invalidateQueries({ queryKey: ["dash-epis"] });
                }}
              />
              {busca || estoqueInv !== "all" || tipoInv !== "all" || obraInv !== "all" ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setBusca("");
                    setEstoqueInv("all");
                    setTipoInv("all");
                    setObraInv("all");
                  }}
                >
                  Limpar filtros
                </Button>
              ) : null}
              <span className="text-xs text-muted-foreground ml-auto">
                {episFiltrados.length} de {epis.length} — o PDF usa o filtro atual
              </span>
            </div>
          </Card>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>CA</TableHead>
                  <TableHead>Obra</TableHead>
                  <TableHead>Estoque</TableHead>
                  <TableHead>Mínimo</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagEpis.paged.map((e: any) => {
                  const baixo = e.estoque_atual < e.estoque_minimo;
                  return (
                    <TableRow key={e.id}>
                      <TableCell className="font-medium">{e.nome}</TableCell>
                      <TableCell>
                        <span className="text-xs px-2 py-0.5 rounded bg-muted">{e.tipo}</span>
                      </TableCell>
                      <TableCell>{e.ca ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{obraNome((e as any).obra_id)}</TableCell>
                      <TableCell className={cn(baixo && "text-destructive font-semibold")}>
                        {e.estoque_atual}
                      </TableCell>
                      <TableCell>{e.estoque_minimo}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {canEdit && (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleEditEpi(e)}
                              title="Editar EPI / EPC"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {canDelete && (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => {
                                if (confirm("Excluir EPI?")) removeEpi.mutate(e.id);
                              }}
                              title="Excluir EPI"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {episFiltrados.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      {epis.length === 0
                        ? "Nenhum EPI cadastrado."
                        : "Nenhum EPI no filtro atual."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            <div className="p-3 border-t">
              <DataPagination
                page={pagEpis.page}
                totalPages={pagEpis.totalPages}
                total={pagEpis.total}
                pageSize={pagEpis.pageSize}
                onPageChange={pagEpis.setPage}
                onPageSizeChange={pagEpis.setPageSize}
                itemLabel="EPIs"
              />
            </div>
          </Card>
        </TabsContent>
        <TabsContent value="movs">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>EPI</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Qtd</TableHead>
                  <TableHead>Obra</TableHead>
                  <TableHead>Funcionário</TableHead>
                  <TableHead>Motivo</TableHead>
                  {(canEdit || canDelete) && <TableHead className="text-right">Ações</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagMovsEpi.paged.map((m: any) => (
                  <TableRow key={m.id}>
                    <TableCell className="text-sm">
                      {m.data_movimento ? new Date(m.data_movimento).toLocaleDateString("pt-BR") : "—"}
                    </TableCell>
                    <TableCell>{m.epis?.nome}</TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded",
                          m.tipo === "entrada" && "bg-success/15 text-success",
                          m.tipo === "saida" && "bg-warning/15 text-warning",
                          m.tipo === "devolucao" && "bg-accent/15 text-accent",
                        )}
                      >
                        {m.tipo === "saida" ? (
                          <ArrowUpFromLine className="h-3 w-3" />
                        ) : (
                          <ArrowDownToLine className="h-3 w-3" />
                        )}
                        {m.tipo}
                      </span>
                    </TableCell>
                    <TableCell>{m.quantidade}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{obraNome(m.obra_id)}</TableCell>
                    <TableCell>{m.funcionarios?.nome ?? "—"}</TableCell>
                    <TableCell className="text-sm">{m.motivo_retirada ?? "—"}</TableCell>
                    {(canEdit || canDelete) && (
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {canEdit && (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleEditMov(m)}
                              title="Editar movimentação"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {canDelete && (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => {
                                if (confirm("Excluir movimentação? O estoque será reajustado.")) removeMov.mutate(m);
                              }}
                              title="Excluir movimentação"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
                {movs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      Nenhuma movimentação registrada.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            {(movs as any[]).length > 0 && (
              <div className="p-3 border-t">
                <DataPagination
                  page={pagMovsEpi.page}
                  totalPages={pagMovsEpi.totalPages}
                  total={pagMovsEpi.total}
                  pageSize={pagMovsEpi.pageSize}
                  onPageChange={pagMovsEpi.setPage}
                  onPageSizeChange={pagMovsEpi.setPageSize}
                  itemLabel="movimentações"
                />
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
