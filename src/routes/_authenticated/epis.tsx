import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { canManage, isAdmin, useUserRoles, useModulePerm } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Plus, Trash2, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/epis")({
  component: EpisPage,
});

function EpisPage() {
  const qc = useQueryClient();
  const { data: roles } = useUserRoles();
  const perm = useModulePerm("epis");
  const canEdit = perm.can_edit;
  const canDelete = perm.can_delete;

  const { data: epis = [] } = useQuery({
    queryKey: ["epis"],
    queryFn: async () => {
      const { data, error } = await supabase.from("epis").select("*").order("nome");
      if (error) throw error;
      return data;
    },
  });

  const { data: movs = [] } = useQuery({
    queryKey: ["epi_movs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("epi_movimentos")
        .select("*, epis(nome,tipo), funcionarios(nome)")
        .order("data_movimento", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  const { data: funcionarios = [] } = useQuery({
    queryKey: ["funcionarios-min"],
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

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ tipo: "EPI", estoque_atual: 0, estoque_minimo: 0 });

  const createEpi = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("epis").insert({
        ...form,
        estoque_atual: Number(form.estoque_atual) || 0,
        estoque_minimo: Number(form.estoque_minimo) || 0,
        validade_meses: form.validade_meses ? Number(form.validade_meses) : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("EPI cadastrado");
      qc.invalidateQueries({ queryKey: ["epis"] });
      qc.invalidateQueries({ queryKey: ["dash-epis"] });
      setOpen(false);
      setForm({ tipo: "EPI", estoque_atual: 0, estoque_minimo: 0 });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const [movOpen, setMovOpen] = useState(false);
  const [movForm, setMovForm] = useState<any>({ tipo: "entrada", quantidade: 1 });

  const createMov = useMutation({
    mutationFn: async () => {
      const qtd = Number(movForm.quantidade) || 1;
      const { error } = await supabase.from("epi_movimentos").insert({
        epi_id: movForm.epi_id,
        funcionario_id: movForm.funcionario_id || null,
        tipo: movForm.tipo,
        quantidade: qtd,
        data_vencimento: null,
        observacoes: movForm.observacoes || null,
        motivo_retirada: movForm.motivo_retirada || null,
      });
      if (error) throw error;
      // Atualiza estoque
      const epi = epis.find((e: any) => e.id === movForm.epi_id);
      if (epi) {
        const delta = movForm.tipo === "entrada" || movForm.tipo === "devolucao" ? qtd : -qtd;
        const { error: err2 } = await supabase
          .from("epis")
          .update({ estoque_atual: Math.max(0, (epi.estoque_atual ?? 0) + delta) })
          .eq("id", epi.id);
        if (err2) throw err2;
      }
    },
    onSuccess: () => {
      toast.success("Movimentação registrada");
      qc.invalidateQueries({ queryKey: ["epis"] });
      qc.invalidateQueries({ queryKey: ["epi_movs"] });
      qc.invalidateQueries({ queryKey: ["dash-epis"] });
      setMovOpen(false);
      setMovForm({ tipo: "entrada", quantidade: 1 });
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
    },
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
              <Dialog open={movOpen} onOpenChange={setMovOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <ArrowDownToLine className="h-4 w-4" /> Movimentar
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Movimentação de EPI</DialogTitle>
                  </DialogHeader>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      createMov.mutate();
                    }}
                    className="space-y-3"
                  >
                    <div className="space-y-1">
                      <Label>EPI / EPC *</Label>
                      <Select
                        value={movForm.epi_id ?? ""}
                        onValueChange={(v) => setMovForm({ ...movForm, epi_id: v })}
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
                      <Button type="submit" disabled={createMov.isPending}>
                        Registrar
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>

              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4" /> Novo EPI
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Cadastrar EPI / EPC</DialogTitle>
                  </DialogHeader>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      createEpi.mutate();
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
                      <Button type="submit" disabled={createEpi.isPending}>
                        Salvar
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </>
          )}
        </div>
      </div>

      <Tabs defaultValue="catalogo">
        <TabsList>
          <TabsTrigger value="catalogo">Catálogo</TabsTrigger>
          <TabsTrigger value="movs">Histórico de movimentações</TabsTrigger>
        </TabsList>
        <TabsContent value="catalogo">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>CA</TableHead>
                  <TableHead>Estoque</TableHead>
                  <TableHead>Mínimo</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {epis.map((e: any) => {
                  const baixo = e.estoque_atual < e.estoque_minimo;
                  return (
                    <TableRow key={e.id}>
                      <TableCell className="font-medium">{e.nome}</TableCell>
                      <TableCell>
                        <span className="text-xs px-2 py-0.5 rounded bg-muted">{e.tipo}</span>
                      </TableCell>
                      <TableCell>{e.ca ?? "—"}</TableCell>
                      <TableCell className={cn(baixo && "text-destructive font-semibold")}>
                        {e.estoque_atual}
                      </TableCell>
                      <TableCell>{e.estoque_minimo}</TableCell>
                      <TableCell className="text-right">
                        {canDelete && (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => {
                              if (confirm("Excluir EPI?")) removeEpi.mutate(e.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {epis.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      Nenhum EPI cadastrado.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
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
                  <TableHead>Funcionário</TableHead>
                  <TableHead>Motivo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movs.map((m: any) => (
                  <TableRow key={m.id}>
                    <TableCell className="text-sm">{m.data_movimento}</TableCell>
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
                    <TableCell>{m.funcionarios?.nome ?? "—"}</TableCell>
                    <TableCell className="text-sm">{m.motivo_retirada ?? "—"}</TableCell>
                  </TableRow>
                ))}
                {movs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      Nenhuma movimentação registrada.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
