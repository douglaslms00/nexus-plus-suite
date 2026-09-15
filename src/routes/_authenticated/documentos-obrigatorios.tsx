import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  useUserRoles,
  useMyCustomRoles,
  useCurrentUser,
  useModulePerm,
  canManage,
  type AppRole,
} from "@/lib/permissions";
import {
  useDocumentRequirements,
  requirementsForFuncao,
  requirementsForCargos,
  docEntregue,
  DOC_REQ_MIGRATION,
  type DocRequirement,
} from "@/lib/document-requirements";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ClipboardCheck,
  ClipboardList,
  CheckCircle2,
  AlertCircle,
  Plus,
  Pencil,
  Trash2,
  Shield,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/documentos-obrigatorios")({
  component: DocsObrigatoriosPage,
});

const SYSTEM_ROLES: { key: AppRole; label: string }[] = [
  { key: "admin", label: "Administrador" },
  { key: "gestor", label: "Gestor" },
  { key: "financeiro", label: "Financeiro" },
  { key: "colaborador", label: "Colaborador" },
];

function DocsObrigatoriosPage() {
  const perm = useModulePerm("documentos");
  const { data: roles } = useUserRoles();
  const gestor = canManage(roles);

  if (!perm.can_view) {
    return (
      <Card className="p-8 text-center text-muted-foreground">
        Você não tem permissão para ver este módulo.
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <ClipboardCheck className="h-7 w-7 text-primary" /> Documentos por cargo
        </h1>
        <p className="text-muted-foreground">
          {gestor
            ? "Defina quais documentos cada cargo/função precisa entregar. Cada funcionário vê apenas o que lhe é exigido."
            : "Veja apenas os documentos exigidos do seu cargo/função."}
        </p>
      </div>

      <Tabs defaultValue="minhas" className="space-y-4">
        <TabsList>
          <TabsTrigger value="minhas">Minhas exigências</TabsTrigger>
          {gestor && <TabsTrigger value="funcionario">Por funcionário</TabsTrigger>}
          {gestor && <TabsTrigger value="gerenciar">Gerenciar</TabsTrigger>}
        </TabsList>

        <TabsContent value="minhas">
          <MinhasExigencias />
        </TabsContent>
        {gestor && (
          <TabsContent value="funcionario">
            <PorFuncionario />
          </TabsContent>
        )}
        {gestor && (
          <TabsContent value="gerenciar">
            <Gerenciar />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

/** Refs unificadas dos meus cargos: sys:admin + cus:<uuid>. */
function useMyCargoRefs(): string[] {
  const { data: roles = [] } = useUserRoles();
  const { data: customs = [] } = useMyCustomRoles();
  return useMemo(
    () => [
      ...(roles ?? []).map((r) => `sys:${r}`),
      ...(customs ?? []).map((c) => `cus:${c.id}`),
    ],
    [roles, customs],
  );
}

/** Tenta descobrir minha função via cadastro de funcionário com o mesmo e-mail. */
function useMinhaFuncao() {
  const { data: user } = useCurrentUser();
  return useQuery({
    queryKey: ["minha-funcao", user?.email],
    enabled: !!user?.email,
    staleTime: 1000 * 60 * 5,
    retry: 1,
    queryFn: async (): Promise<{ id: string; nome: string; funcao: string | null } | null> => {
      try {
        const { data, error } = await supabase
          .from("funcionarios")
          .select("id, nome, funcao")
          .eq("email", user!.email!)
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        return (data as { id: string; nome: string; funcao: string | null } | null) ?? null;
      } catch (e: any) {
        console.warn("[docs-obrigatorios] minha função indisponível:", e?.message ?? e);
        return null;
      }
    },
  });
}

function MissingBanner({ tableMissing }: { tableMissing: boolean }) {
  if (!tableMissing) return null;
  return (
    <Card className="p-3.5 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800">
      A tabela de exigências ainda não existe no banco. Aplique a migration{" "}
      <code className="font-mono">{DOC_REQ_MIGRATION}</code> no Supabase SQL Editor para ativar
      esta tela.
    </Card>
  );
}

function StatusBadge({ entregue }: { entregue: boolean }) {
  return entregue ? (
    <Badge variant="default" className="gap-1 bg-emerald-600 hover:bg-emerald-600 text-xs">
      <CheckCircle2 className="h-3 w-3" /> Entregue
    </Badge>
  ) : (
    <Badge variant="outline" className="gap-1 text-xs border-amber-300 text-amber-700 dark:text-amber-400">
      <AlertCircle className="h-3 w-3" /> Pendente
    </Badge>
  );
}

/** Aba 1: o usuário logado vê SÓ o que é exigido dele (cargo + função). */
function MinhasExigencias() {
  const cargoRefs = useMyCargoRefs();
  const { data: reqs = [], isLoading, tableMissing } = useDocumentRequirements();
  const { data: meuFunc } = useMinhaFuncao();
  const [funcaoManual, setFuncaoManual] = useState("");

  const funcao = meuFunc?.funcao || funcaoManual.trim() || null;

  const minhas = useMemo(() => {
    const porCargo = requirementsForCargos(reqs, cargoRefs);
    const porFuncao = requirementsForFuncao(reqs, funcao);
    const map = new Map<string, DocRequirement>();
    for (const r of [...porCargo, ...porFuncao]) map.set(r.id, r);
    return [...map.values()].sort((a, b) => a.documento_nome.localeCompare(b.documento_nome, "pt-BR"));
  }, [reqs, cargoRefs, funcao]);

  const { data: meusDocs = [] } = useQuery({
    queryKey: ["meus-docs-exigidos", meuFunc?.id],
    enabled: !!meuFunc?.id,
    staleTime: 1000 * 60 * 2,
    retry: 1,
    queryFn: async () => {
      try {
        const { data, error } = await (supabase as any)
          .from("funcionario_documentos")
          .select("nome")
          .eq("funcionario_id", meuFunc!.id);
        if (error) throw error;
        return (data ?? []) as { nome: string }[];
      } catch {
        return [] as { nome: string }[];
      }
    },
  });

  if (isLoading) return <Card className="p-8 text-center text-muted-foreground">Carregando...</Card>;

  return (
    <div className="space-y-4">
      <MissingBanner tableMissing={tableMissing} />
      {!meuFunc?.funcao && (
        <Card className="p-4 flex flex-col sm:flex-row gap-2 sm:items-end">
          <div className="flex-1">
            <Label className="text-xs">Sua função (para ver as exigências do seu cargo operacional)</Label>
            <Input
              placeholder="Ex.: Pedreiro, Eletricista, Servente..."
              value={funcaoManual}
              onChange={(e) => setFuncaoManual(e.target.value)}
              className="mt-1 h-9 text-sm"
            />
          </div>
        </Card>
      )}
      {minhas.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          Nenhum documento exigido para o seu perfil no momento. 🎉
        </Card>
      ) : (
        <div className="space-y-2">
          {minhas.map((r) => {
            const entregue = meuFunc?.id ? docEntregue(meusDocs, r.documento_nome) : false;
            return (
              <Card key={r.id} className="p-3.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold flex items-center gap-2 flex-wrap">
                    <ClipboardList className="h-4 w-4 text-primary shrink-0" />
                    {r.documento_nome}
                    {!r.obrigatorio && (
                      <Badge variant="secondary" className="text-[10px]">opcional</Badge>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {[r.funcao && `Função: ${r.funcao}`, cargoLabel(r.cargo_ref), r.descricao, r.validade_meses ? `Validade: ${r.validade_meses} meses` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                {meuFunc?.id ? (
                  <StatusBadge entregue={entregue} />
                ) : (
                  <span className="text-[11px] text-muted-foreground shrink-0">—</span>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Aba 2 (gestor): escolhe um funcionário e vê SÓ o exigido da função dele. */
function PorFuncionario() {
  const { data: reqs = [], tableMissing } = useDocumentRequirements();
  const [funcId, setFuncId] = useState<string>("");

  const { data: funcionarios = [] } = useQuery({
    queryKey: ["func-min-docs-req"],
    staleTime: 1000 * 60 * 5,
    retry: 1,
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("funcionarios")
          .select("id, nome, funcao")
          .eq("ativo", true)
          .order("nome")
          .limit(1000);
        if (error) throw error;
        return (data ?? []) as { id: string; nome: string; funcao: string | null }[];
      } catch (e: any) {
        console.warn("[docs-obrigatorios] funcionários indisponíveis:", e?.message ?? e);
        return [];
      }
    },
  });

  const func = funcionarios.find((f) => f.id === funcId) ?? null;
  const exigidos = useMemo(
    () => requirementsForFuncao(reqs, func?.funcao),
    [reqs, func?.funcao],
  );

  const { data: docs = [] } = useQuery({
    queryKey: ["func-docs-req", funcId],
    enabled: !!funcId,
    staleTime: 1000 * 60 * 2,
    retry: 1,
    queryFn: async () => {
      try {
        const { data, error } = await (supabase as any)
          .from("funcionario_documentos")
          .select("nome")
          .eq("funcionario_id", funcId);
        if (error) throw error;
        return (data ?? []) as { nome: string }[];
      } catch {
        return [] as { nome: string }[];
      }
    },
  });

  const entregues = exigidos.filter((r) => docEntregue(docs, r.documento_nome)).length;

  return (
    <div className="space-y-4">
      <MissingBanner tableMissing={tableMissing} />
      <Card className="p-4">
        <Label className="text-xs">Funcionário</Label>
        <Select value={funcId} onValueChange={setFuncId}>
          <SelectTrigger className="mt-1">
            <SelectValue placeholder="Selecione o funcionário" />
          </SelectTrigger>
          <SelectContent>
            {funcionarios.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.nome}{f.funcao ? ` — ${f.funcao}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {func && (
          <p className="text-xs text-muted-foreground mt-2">
            Função: <b>{func.funcao || "não informada"}</b> · {entregues}/{exigidos.length} documentos entregues
          </p>
        )}
      </Card>

      {!func ? (
        <Card className="p-8 text-center text-muted-foreground">
          Selecione um funcionário para ver apenas os documentos exigidos dele.
        </Card>
      ) : exigidos.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          Nenhum documento exigido para a função <b>{func.funcao || "—"}</b>. Cadastre as
          exigências na aba Gerenciar.
        </Card>
      ) : (
        <div className="space-y-2">
          {exigidos.map((r) => (
            <Card key={r.id} className="p-3.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold">{r.documento_nome}</p>
                {(() => {
                  const detalhe = [
                    r.descricao,
                    r.validade_meses ? `Validade: ${r.validade_meses} meses` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  return detalhe ? (
                    <p className="text-xs text-muted-foreground mt-0.5">{detalhe}</p>
                  ) : null;
                })()}
              </div>
              <StatusBadge entregue={docEntregue(docs, r.documento_nome)} />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function cargoLabel(ref: string | null): string | null {
  if (!ref) return null;
  if (ref.startsWith("sys:")) {
    const k = ref.slice(4);
    return `Cargo: ${SYSTEM_ROLES.find((s) => s.key === k)?.label ?? k}`;
  }
  if (ref.startsWith("cus:")) return "Cargo personalizado";
  return `Cargo: ${ref}`;
}

/** Aba 3 (gestor): CRUD das exigências por cargo/função. */
function Gerenciar() {
  const qc = useQueryClient();
  const { data: reqs = [], tableMissing } = useDocumentRequirements();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<DocRequirement | null>(null);

  const { data: customRoles = [] } = useQuery({
    queryKey: ["custom-roles-docs-req"],
    staleTime: 1000 * 60 * 5,
    retry: 1,
    queryFn: async () => {
      try {
        const { data } = await (supabase as any)
          .from("custom_roles")
          .select("id, label")
          .order("label");
        return data ?? [];
      } catch {
        return [];
      }
    },
  });

  // Form
  const [alvo, setAlvo] = useState<"sys" | "cus" | "funcao">("funcao");
  const [cargoSys, setCargoSys] = useState<string>("colaborador");
  const [cargoCus, setCargoCus] = useState<string>("");
  const [funcao, setFuncao] = useState("");
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [validade, setValidade] = useState("");
  const [obrigatorio, setObrigatorio] = useState(true);

  const reset = () => {
    setEditing(null);
    setAlvo("funcao");
    setCargoSys("colaborador");
    setCargoCus("");
    setFuncao("");
    setNome("");
    setDescricao("");
    setValidade("");
    setObrigatorio(true);
  };

  const openEdit = (r: DocRequirement) => {
    setEditing(r);
    if (r.funcao && !r.cargo_ref) {
      setAlvo("funcao");
      setFuncao(r.funcao);
    } else if (r.cargo_ref?.startsWith("cus:")) {
      setAlvo("cus");
      setCargoCus(r.cargo_ref.slice(4));
      setFuncao(r.funcao ?? "");
    } else {
      setAlvo("sys");
      setCargoSys(r.cargo_ref?.slice(4) ?? "colaborador");
      setFuncao(r.funcao ?? "");
    }
    setNome(r.documento_nome);
    setDescricao(r.descricao ?? "");
    setValidade(r.validade_meses != null ? String(r.validade_meses) : "");
    setObrigatorio(r.obrigatorio);
    setOpen(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      const docNome = nome.trim();
      if (!docNome) throw new Error("Informe o nome do documento.");
      let cargo_ref: string | null = null;
      let funcaoVal: string | null = funcao.trim() || null;
      if (alvo === "sys") cargo_ref = `sys:${cargoSys}`;
      else if (alvo === "cus") {
        if (!cargoCus) throw new Error("Selecione o cargo personalizado.");
        cargo_ref = `cus:${cargoCus}`;
      } else if (!funcaoVal) {
        throw new Error("Informe a função (ex.: Pedreiro).");
      }
      const payload: any = {
        cargo_ref,
        funcao: funcaoVal,
        documento_nome: docNome,
        descricao: descricao.trim() || null,
        validade_meses: validade ? Number(validade) : null,
        obrigatorio,
      };
      if (editing) {
        const { error } = await (supabase as any)
          .from("cargo_document_requirements")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { data: user } = await supabase.auth.getUser();
        const { error } = await (supabase as any)
          .from("cargo_document_requirements")
          .insert({ ...payload, created_by: user?.user?.id ?? null });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Exigência atualizada" : "Exigência criada");
      qc.invalidateQueries({ queryKey: ["doc-requirements"] });
      setOpen(false);
      reset();
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao salvar"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("cargo_document_requirements")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Exigência removida");
      qc.invalidateQueries({ queryKey: ["doc-requirements"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao remover"),
  });

  const grouped = useMemo(() => {
    const m = new Map<string, DocRequirement[]>();
    for (const r of reqs) {
      const key = r.funcao?.trim() || cargoLabel(r.cargo_ref) || "Outros";
      const list = m.get(key) ?? [];
      list.push(r);
      m.set(key, list);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], "pt-BR"));
  }, [reqs]);

  return (
    <div className="space-y-4">
      <MissingBanner tableMissing={tableMissing} />
      <div className="flex justify-end">
        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) reset();
          }}
        >
          <DialogTrigger asChild>
            <Button className="gap-1.5">
              <Plus className="h-4 w-4" /> Nova exigência
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Editar exigência" : "Nova exigência"}</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                save.mutate();
              }}
              className="space-y-3 py-2"
            >
              <div>
                <Label className="text-xs">Exigir de</Label>
                <Select value={alvo} onValueChange={(v) => setAlvo(v as typeof alvo)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="funcao">Função do funcionário (ex.: Pedreiro)</SelectItem>
                    <SelectItem value="sys">Cargo do sistema</SelectItem>
                    <SelectItem value="cus" disabled={customRoles.length === 0}>
                      Cargo personalizado
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {alvo === "sys" && (
                <div>
                  <Label className="text-xs">Cargo do sistema</Label>
                  <Select value={cargoSys} onValueChange={setCargoSys}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SYSTEM_ROLES.map((s) => (
                        <SelectItem key={s.key} value={s.key}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {alvo === "cus" && (
                <div>
                  <Label className="text-xs">Cargo personalizado</Label>
                  <Select value={cargoCus} onValueChange={setCargoCus}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {customRoles.map((c: any) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {alvo !== "funcao" && (
                <p className="text-[11px] text-muted-foreground">
                  Opcional: restrinja ainda mais informando a função junto ao cargo.
                </p>
              )}
              <div>
                <Label className="text-xs">
                  Função {alvo === "funcao" ? "*" : "(opcional)"}
                </Label>
                <Input
                  placeholder="Ex.: Pedreiro, Eletricista, Servente"
                  value={funcao}
                  onChange={(e) => setFuncao(e.target.value)}
                  className="mt-1"
                />
              </div>

              <div>
                <Label className="text-xs">Documento exigido *</Label>
                <Input
                  placeholder="Ex.: ASO, NR-35, CNH, Ficha EPI"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Descrição (opcional)</Label>
                <Input
                  placeholder="Detalhe o que deve ser entregue"
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Validade (meses, opcional)</Label>
                <Input
                  type="number"
                  min={1}
                  placeholder="Ex.: 12"
                  value={validade}
                  onChange={(e) => setValidade(e.target.value)}
                  className="mt-1"
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={obrigatorio} onCheckedChange={(v) => setObrigatorio(!!v)} />
                Obrigatório
              </label>
              <DialogFooter>
                <Button type="submit" disabled={save.isPending}>
                  {save.isPending ? "Salvando..." : editing ? "Salvar" : "Criar"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {reqs.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          Nenhuma exigência cadastrada. Clique em “Nova exigência” para começar.
        </Card>
      ) : (
        grouped.map(([grupo, list]) => (
          <Card key={grupo} className="p-4 space-y-2">
            <h3 className="font-semibold text-sm flex items-center gap-1.5">
              {grupo.startsWith("Cargo") ? (
                <Shield className="h-4 w-4 text-primary" />
              ) : (
                <Sparkles className="h-4 w-4 text-primary" />
              )}
              {grupo}
              <Badge variant="secondary" className="text-[10px] ml-1">
                {list.length}
              </Badge>
            </h3>
            {list.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between gap-2 rounded-lg border p-2.5"
              >
                <div className="min-w-0">
                  <p className={cn("text-sm font-medium", !r.obrigatorio && "text-muted-foreground")}>
                    {r.documento_nome}
                    {!r.obrigatorio && (
                      <span className="ml-2 text-[10px] uppercase text-muted-foreground">opcional</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {[cargoLabel(r.cargo_ref), r.descricao, r.validade_meses ? `Validade: ${r.validade_meses}m` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="icon" variant="ghost" title="Editar" onClick={() => openEdit(r)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    title="Excluir"
                    className="text-destructive hover:text-destructive"
                    onClick={() => confirm(`Remover exigência "${r.documento_nome}"?`) && remove.mutate(r.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </Card>
        ))
      )}
    </div>
  );
}
