import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { canManage, isAdmin, useUserRoles, useModulePerm } from "@/lib/permissions";
import { useObraAtual } from "@/lib/obra-context.types";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus,
  Trash2,
  Pencil,
  FileText,
  Upload,
  Download,
  Bell,
  AlertTriangle,
  AlertCircle,
  ClipboardList,
} from "lucide-react";
import { toast } from "sonner";
import { uploadAnexo, getAnexoUrl } from "@/lib/upload";
import { differenceInDays, addMonths } from "date-fns";
import { cn, safeParseISO, safeFormatDate } from "@/lib/utils";
import { lerFichaRegistro, lerFichaRegistroPdf } from "@/lib/ocr.functions";

export const Route = createFileRoute("/_authenticated/funcionarios")({
  component: FuncionariosPage,
});

const VENC: ReadonlyArray<readonly [string, string, string | null]> = [
  ["vencimento_aso", "ASO", "validade_meses_aso"],
  ["vencimento_ficha_epi", "Ficha EPI", "validade_meses_ficha_epi"],
  ["vencimento_folga_campo", "Folga Campo", "validade_meses_folga_campo"],
  ["vencimento_ferias", "Férias", "validade_meses_ferias"],
  ["vencimento_experiencia", "Experiência", "validade_meses_experiencia"],
] as const;

type TreinamentoItem = { id: string; nome: string; data_realizacao: string; data_validade: string };
function novoTreinamento(): TreinamentoItem {
  return { id: crypto.randomUUID(), nome: "", data_realizacao: "", data_validade: "" };
}

function novoTreinamentoWithNome(nome: string): TreinamentoItem {
  return { id: crypto.randomUUID(), nome, data_realizacao: "", data_validade: "" };
}

type Funcionario = any;

function vencColor(date?: string | null) {
  if (!date) return "text-muted-foreground";
  const days = differenceInDays(safeParseISO(date), new Date());
  if (days < 0) return "text-destructive font-semibold";
  if (days <= 30) return "text-warning font-semibold";
  return "text-success";
}

function diasParaVencimento(dateInput: string | Date | null): number {
  if (!dateInput) return 9999;
  const date = typeof dateInput === "string" ? safeParseISO(dateInput) : dateInput;
  return differenceInDays(date, new Date());
}

function countVencimentosAbertos(func: any): { proximos: number; vencidos: number } {
  let proximos = 0;
  let vencidos = 0;
  const hoje = new Date();
  for (const item of VENC) {
    const keyVenc = item[0];
    if (!keyVenc) continue;
    // Experiência concluída não gera alerta
    if (keyVenc === "vencimento_experiencia" && isExperienciaConcluida(func)) continue;
    const date = func[keyVenc];
    if (!date) continue;
    const dias = differenceInDays(safeParseISO(date), hoje);
    if (dias < 0) vencidos++;
    else if (dias <= 30) proximos++;
  }
  return { proximos, vencidos };
}

function countTreinamentosAbertos(treinamentos: readonly TreinamentoItem[]): {
  proximos: number;
  vencidos: number;
} {
  let proximos = 0;
  let vencidos = 0;
  const hoje = new Date();
  for (const t of treinamentos) {
    if (!t.data_validade || !t.nome.trim()) continue;
    const dias = differenceInDays(safeParseISO(t.data_validade), hoje);
    if (dias < 0) vencidos++;
    else if (dias <= 30) proximos++;
  }
  return { proximos, vencidos };
}

// Experiência é considerada concluída automaticamente quando passa da data de vencimento
// ou quando o flag manual experiencia_concluida está marcado.
function isExperienciaConcluida(f: any) {
  if (f?.experiencia_concluida) return true;
  if (f?.vencimento_experiencia) {
    return differenceInDays(safeParseISO(f.vencimento_experiencia), new Date()) < 0;
  }
  return false;
}

// Extrai do erro do Supabase as colunas que não existem no schema do banco
// (ex.: "Could not find the 'data_aso' column of 'funcionarios' in the schema cache").
function colunasMissing(msg: string): string[] {
  const out: string[] = [];
  const re = /Could not find the '([^']+)' column of '[^']+'\s*in the schema cache/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(msg))) out.push(m[1]);
  return out;
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
    staleTime: 1000 * 60 * 2,
    queryFn: async () => {
      let q = supabase.from("funcionarios").select("*").order("nome").limit(1000);
      if (obraId) q = q.eq("obra_id", obraId);
      const { data, error } = await q;
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: obras = [] } = useQuery({
    queryKey: ["obras-min-func"],
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const { data, error } = await supabase.from("obras").select("id, nome").order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: allTreinamentosRaw = [] } = useQuery({
    queryKey: ["funcionario-treinamentos-all", funcionarios.map((f: any) => f.id).sort().join(",")],
    enabled: funcionarios.length > 0,
    staleTime: 1000 * 60 * 2,
    queryFn: async () => {
      const ids = funcionarios.map((f: any) => f.id);
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from("funcionario_treinamentos")
        .select("funcionario_id, nome, data_validade, data_realizacao")
        .in("funcionario_id", ids)
        .limit(2000);
      if (error) throw error;
      return data as Array<{
        funcionario_id: string;
        nome: string;
        data_validade: string | null;
        data_realizacao: string | null;
      }>;
    },
  });

  const treinamentosPorFuncionario = useMemo(() => {
    const m = new Map<string, Array<{ nome: string; data_validade: string | null }>>();
    for (const t of allTreinamentosRaw as any[]) {
      const list = m.get(t.funcionario_id) ?? [];
      list.push(t);
      m.set(t.funcionario_id, list);
    }
    for (const [, arr] of m) {
      arr.sort((a, b) => (a.data_validade ?? "").localeCompare(b.data_validade ?? ""));
    }
    return m;
  }, [allTreinamentosRaw]);

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
  const [treinamentos, setTreinamentos] = useState<TreinamentoItem[]>([novoTreinamento()]);
  const [abaForm, setAbaForm] = useState<"dados" | "treinamentos">("dados");
  const [funcionarioToDelete, setFuncionarioToDelete] = useState<Funcionario | null>(null);

  const [highlightId, setHighlightId] = useState<string | null>(() => {
    if (typeof window !== "undefined") return new URLSearchParams(window.location.search).get("highlight");
    return null;
  });

  const filtered = useMemo(() => {
    return funcionarios.filter((f: any) => {
      if (
        busca &&
        !`${f.nome ?? ""} ${f.funcao ?? ""} ${f.setor ?? ""} ${f.cpf ?? ""} ${f.matricula ?? ""}`
          .toLowerCase()
          .includes(busca.toLowerCase())
      )
        return false;
      if (fStatus === "ativos" && !f.ativo) return false;
      if (fStatus === "inativos" && f.ativo) return false;
      if (fObra !== "todas" && f.obra_id !== fObra) return false;
      if (fVenc !== "todos") {
        const conclusaoExp = isExperienciaConcluida(f);
        const dates = VENC.filter(([k]) => {
          if (k === "vencimento_experiencia" && conclusaoExp) return false;
          return !!f[k];
        }).map(([k]) => f[k] as string);
        const hasOverdue = dates.some((d) => differenceInDays(safeParseISO(d), new Date()) < 0);
        const hasSoon = dates.some((d) => {
          const x = differenceInDays(safeParseISO(d), new Date());
          return x >= 0 && x <= 30;
        });
        if (fVenc === "vencidos" && !hasOverdue) return false;
        if (fVenc === "proximos" && !hasSoon) return false;
      }
      return true;
    });
  }, [funcionarios, busca, fStatus, fObra, fVenc]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const h = params.get("highlight");
    if (h) setHighlightId(h);
  }, []);

  useEffect(() => {
    if (!highlightId || filtered.length === 0) return;
    const el = document.getElementById(`func-${highlightId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-primary", "ring-offset-1");
      const t = setTimeout(() => el.classList.remove("ring-2", "ring-primary", "ring-offset-1"), 3000);
      return () => clearTimeout(t);
    }
  }, [highlightId, filtered]);

  const openNew = () => {
    setEditing(null);
    setAbaForm("dados");
    setFichaRegistro(null);
    setForm({ ativo: true });
    setTreinamentos([novoTreinamento()]);
    setOpen(true);
  };
  const openEdit = async (f: Funcionario) => {
    setEditing(f);
    setAbaForm("dados");
    setFichaRegistro(null);
    setForm({ ...f });
    // Carrega treinamentos existentes do funcionário
    try {
      const { data } = await (supabase as any)
        .from("funcionario_treinamentos")
        .select("*")
        .eq("funcionario_id", f.id)
        .order("created_at");
      setTreinamentos(
        data && data.length > 0
          ? data.map((t: any) => ({
              id: t.id,
              nome: t.nome ?? "",
              data_realizacao: t.data_realizacao ?? "",
              data_validade: t.data_validade ?? "",
            }))
          : [novoTreinamento()],
      );
    } catch {
      setTreinamentos([novoTreinamento()]);
    }
    setOpen(true);
  };

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
    setLendoFicha(true);
    try {
      const fileDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Não foi possível ler o arquivo"));
        reader.readAsDataURL(file);
      });
      let dados;
      if (isPdf) {
        // Extrai apenas a parte base64 do data URL (remove o prefixo "data:application/pdf;base64,")
        const pdfBase64 = fileDataUrl.split(",")[1];
        dados = await lerFichaRegistroPdf({ data: { pdfBase64 } });
      } else {
        dados = await lerFichaRegistro({ data: { imageDataUrl: fileDataUrl } });
      }
      setForm((atual: any) => ({
        ...atual,
        ...Object.fromEntries(Object.entries(dados).filter(([, value]) => value)),
      }));
      toast.success("Ficha lida com sucesso. Confira os dados antes de salvar.");
    } catch (e: any) {
      toast.error(e.message ?? "Não foi possível ler a ficha");
    } finally {
      setLendoFicha(false);
    }
  };

  // Colunas conhecidas da tabela funcionarios (exclui colunas que podem não existir ainda)
  const COLUNAS_FUNC = [
    "nome",
    "cpf",
    "telefone",
    "email",
    "funcao",
    "setor",
    "data_admissao",
    "data_nascimento",
    "endereco",
    "cidade",
    "matricula",
    "obra_id",
    "ativo",
    "experiencia_concluida",
    "vencimento_aso",
    "validade_meses_aso",
    "data_aso",
    "vencimento_ficha_epi",
    "validade_meses_ficha_epi",
    "vencimento_folga_campo",
    "validade_meses_folga_campo",
    "data_folga_campo",
    "vencimento_ferias",
    "validade_meses_ferias",
    "data_ferias",
    "vencimento_treinamento",
    "validade_meses_treinamento",
    "vencimento_experiencia",
    "validade_meses_experiencia",
    "data_experiencia",
  ];

  const upsert = useMutation({
    mutationFn: async (payload: any) => {
      // Filtra apenas colunas conhecidas e remove strings vazias
      const data: any = {};
      COLUNAS_FUNC.forEach((k) => {
        if (k in payload) data[k] = payload[k] === "" ? null : payload[k];
      });
      let funcionarioId = editing?.id;
      const faltantes = new Set<string>();
      // Tenta salvar; se o Supabase indicar colunas que ainda não existem no schema
      // (ex.: data_aso, data_ferias, data_folga_campo), remove-as e tenta novamente em loop.
      const salvar = async (isUpdate: boolean) => {
        for (let i = 0; i <= COLUNAS_FUNC.length; i++) {
          const fn = isUpdate
            ? () => supabase.from("funcionarios").update(data).eq("id", editing!.id)
            : () => supabase.from("funcionarios").insert(data).select("id").single();
          const { error, data: res } = await fn();
          if (!error) return res;
          const miss = colunasMissing(error.message ?? "");
          if (miss.length === 0 || miss.every((m) => faltantes.has(m))) throw error;
          miss.forEach((m) => faltantes.add(m));
          miss.forEach((m) => delete data[m]);
        }
        throw new Error("Não foi possível salvar após remover as colunas ausentes.");
      };
      if (editing) {
        await salvar(true);
      } else {
        const res = await salvar(false);
        funcionarioId = res?.id;
      }
      if (faltantes.size > 0) {
        toast.warning(
          `Colunas ainda não existem no Supabase: ${[...faltantes].join(", ")}. Aplique a migration para salvar esses campos.`,
        );
      }
      // Salva treinamentos dinâmicos
      if (funcionarioId) {
        const treinamentosValidos = treinamentos.filter((t) => t.nome.trim());
        if (treinamentosValidos.length > 0) {
          // Remove treinamentos antigos e reinserir
          await (supabase as any)
            .from("funcionario_treinamentos")
            .delete()
            .eq("funcionario_id", funcionarioId);
          const rows = treinamentosValidos.map((t) => ({
            funcionario_id: funcionarioId,
            nome: t.nome.trim(),
            data_realizacao: t.data_realizacao || null,
            data_validade: t.data_validade || null,
          }));
          const { error: te } = await (supabase as any)
            .from("funcionario_treinamentos")
            .insert(rows);
          if (te) console.warn("Treinamentos não salvos:", te.message);
        }
      }
      if (fichaRegistro && funcionarioId) {
        const path = await uploadAnexo(fichaRegistro, `funcionarios/${funcionarioId}`);
        const user = (await supabase.auth.getUser()).data.user;
        const { error } = await (supabase as any).from("funcionario_documentos").insert({
          funcionario_id: funcionarioId,
          nome: fichaRegistro.name,
          tipo: fichaRegistro.type || null,
          storage_path: path,
          tamanho: fichaRegistro.size,
          uploaded_by: user?.id ?? null,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Funcionário atualizado" : "Funcionário criado");
      qc.invalidateQueries({ queryKey: ["funcionarios"] });
      qc.invalidateQueries({ queryKey: ["dash-funcionarios"] });
      qc.invalidateQueries({ queryKey: ["funcionario-treinamentos-all"] });
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
          <p className="text-muted-foreground">
            Cadastro, status de experiência e controle de vencimentos.
          </p>
        </div>
        {canEdit && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openNew}>
                <Plus className="h-4 w-4" /> Novo
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editing ? "Editar funcionário" : "Novo funcionário"}</DialogTitle>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  upsert.mutate(form);
                }}
                className="space-y-4"
              >
                <Tabs
                  value={abaForm}
                  onValueChange={(v) => setAbaForm(v as "dados" | "treinamentos")}
                >
                  <TabsList className="w-full">
                    <TabsTrigger value="dados" className="flex-1">
                      Dados
                    </TabsTrigger>
                    <TabsTrigger value="treinamentos" className="flex-1">
                      Treinamentos
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="dados" className="mt-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2 space-y-1">
                        <Label>Nome *</Label>
                        <Input
                          required
                          value={form.nome ?? ""}
                          onChange={(e) => setForm({ ...form, nome: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>CPF</Label>
                        <Input
                          value={form.cpf ?? ""}
                          onChange={(e) => setForm({ ...form, cpf: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Telefone</Label>
                        <Input
                          value={form.telefone ?? ""}
                          onChange={(e) => setForm({ ...form, telefone: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Função</Label>
                        <Input
                          value={form.funcao ?? ""}
                          onChange={(e) => setForm({ ...form, funcao: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Setor</Label>
                        <Input
                          value={form.setor ?? ""}
                          onChange={(e) => setForm({ ...form, setor: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>E-mail</Label>
                        <Input
                          type="email"
                          value={form.email ?? ""}
                          onChange={(e) => setForm({ ...form, email: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Data admissão</Label>
                        <Input
                          type="date"
                          value={form.data_admissao ?? ""}
                          onChange={(e) => setForm({ ...form, data_admissao: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Data de nascimento</Label>
                        <Input
                          type="date"
                          value={form.data_nascimento ?? ""}
                          onChange={(e) => setForm({ ...form, data_nascimento: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Matrícula</Label>
                        <Input
                          value={form.matricula ?? ""}
                          onChange={(e) => setForm({ ...form, matricula: e.target.value })}
                        />
                      </div>
                      <div className="col-span-2 space-y-1">
                        <Label>Endereço</Label>
                        <Input
                          value={form.endereco ?? ""}
                          onChange={(e) => setForm({ ...form, endereco: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Cidade</Label>
                        <Input
                          value={form.cidade ?? ""}
                          onChange={(e) => setForm({ ...form, cidade: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Obra</Label>
                        <Select
                          value={form.obra_id ?? ""}
                          onValueChange={(v) => setForm({ ...form, obra_id: v })}
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

                      <div className="col-span-2 pt-2 border-t">
                        <p className="text-sm font-semibold mb-2">Documentação e validades</p>
                        <div className="grid grid-cols-3 gap-3">
                          {(
                            [
                              ["ASO", "data_aso", "vencimento_aso"],
                              ["Férias", "data_ferias", "vencimento_ferias"],
                              ["Folga de campo", "data_folga_campo", "vencimento_folga_campo"],
                              ["Experiência", "data_experiencia", "vencimento_experiencia"],
                            ] as const
                          ).map(([rotulo, keyData, keyVenc]) => (
                            <div
                              key={rotulo}
                              className="rounded-lg border p-3 space-y-2 bg-muted/10"
                            >
                              <span className="text-xs font-medium text-muted-foreground">
                                {rotulo}
                              </span>
                              <div className="space-y-1">
                                <Label className="text-xs">Data</Label>
                                <Input
                                  type="date"
                                  value={form[keyData] ?? ""}
                                  onChange={(e) => setForm({ ...form, [keyData]: e.target.value })}
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Validade</Label>
                                <Input
                                  type="date"
                                  value={form[keyVenc] ?? ""}
                                  onChange={(e) => setForm({ ...form, [keyVenc]: e.target.value })}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="col-span-2 flex items-center gap-2 pt-2 border-t">
                        <label className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={!!form.ativo}
                            onCheckedChange={(v) => setForm({ ...form, ativo: !!v })}
                          />
                          Ativo
                        </label>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="treinamentos" className="mt-4">
                    <div className="space-y-4">
                      {/* Seleção de treinamento NR */}
                      <div className="space-y-2">
                        <Label>Selecionar treinamento</Label>
                        <Select
                          value={form.treinamentoSelecionado ?? ""}
                          onValueChange={(v) => {
                            setForm({ ...form, treinamentoSelecionado: v });
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione um treinamento" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="NR-1">
                              NR-1 - Disposições Gerais e Gerenciamento de Riscos Ocupacionais
                            </SelectItem>
                            <SelectItem value="NR-2">NR-2 - Inspeção Prévia (Revogada)</SelectItem>
                            <SelectItem value="NR-3">NR-3 - Embargo e Interdição</SelectItem>
                            <SelectItem value="NR-4">
                              NR-4 - Serviços Especializados em Segurança e em Medicina do Trabalho
                            </SelectItem>
                            <SelectItem value="NR-5">
                              NR-5 - Comissão Interna de Prevenção de Acidentes e de Assédio - CIPA
                            </SelectItem>
                            <SelectItem value="NR-6">
                              NR-6 - Equipamento de Proteção Individual - EPI
                            </SelectItem>
                            <SelectItem value="NR-7">
                              NR-7 - Programa de Controle Médico de Saúde Ocupacional
                            </SelectItem>
                            <SelectItem value="NR-8">NR-8 - Edificações</SelectItem>
                            <SelectItem value="NR-9">
                              NR-9 - Avaliação e Controle das Exposições Ocupacionais a Agentes
                              Físicos, Químicos e Biológicos
                            </SelectItem>
                            <SelectItem value="NR-10">
                              NR-10 - Segurança em Instalações e Serviços em Eletricidade
                            </SelectItem>
                            <SelectItem value="NR-11">
                              NR-11 - Transporte, Movimentação, Armazenagem e Manuseio de Materiais
                            </SelectItem>
                            <SelectItem value="NR-12">
                              NR-12 - Segurança no Trabalho em Máquinas e Equipamentos
                            </SelectItem>
                            <SelectItem value="NR-13">
                              NR-13 - Caldeiras, Vasos de Pressão e Tubulações e Tanques Metálicos
                              de Armazenamento
                            </SelectItem>
                            <SelectItem value="NR-14">NR-14 - Fornos</SelectItem>
                            <SelectItem value="NR-15">
                              NR-15 - Atividades e Operações Insalubres
                            </SelectItem>
                            <SelectItem value="NR-16">
                              NR-16 - Atividades e Operações Perigosas
                            </SelectItem>
                            <SelectItem value="NR-17">NR-17 - Ergonomia</SelectItem>
                            <SelectItem value="NR-18">
                              NR-18 - Segurança e Saúde no Trabalho na Indústria da Construção
                            </SelectItem>
                            <SelectItem value="NR-19">NR-19 - Explosivos</SelectItem>
                            <SelectItem value="NR-20">
                              NR-20 - Segurança e Saúde no Trabalho com Inflamáveis e Combustíveis
                            </SelectItem>
                            <SelectItem value="NR-21">NR-21 - Trabalhos a Céu Aberto</SelectItem>
                            <SelectItem value="NR-22">
                              NR-22 - Segurança e Saúde Ocupacional na Mineração
                            </SelectItem>
                            <SelectItem value="NR-23">NR-23 - Proteção Contra Incêndios</SelectItem>
                            <SelectItem value="NR-24">
                              NR-24 - Condições Sanitárias e de Conforto nos Locais de Trabalho
                            </SelectItem>
                            <SelectItem value="NR-25">NR-25 - Resíduos Industriais</SelectItem>
                            <SelectItem value="NR-26">NR-26 - Sinalização de Segurança</SelectItem>
                            <SelectItem value="NR-27">
                              NR-27 - Registro Profissional do Técnico de Segurança do Trabalho
                              (Revogada)
                            </SelectItem>
                            <SelectItem value="NR-28">
                              NR-28 - Fiscalização e Penalidades
                            </SelectItem>
                            <SelectItem value="NR-29">
                              NR-29 - Norma Regulamentadora de Segurança e Saúde no Trabalho
                              Portuário
                            </SelectItem>
                            <SelectItem value="NR-30">
                              NR-30 - Segurança e Saúde no Trabalho Aquaviário
                            </SelectItem>
                            <SelectItem value="NR-31">
                              NR-31 - Segurança e Saúde no Trabalho na Agricultura, Pecuária,
                              Silvicultura, Exploração Florestal e Aquicultura
                            </SelectItem>
                            <SelectItem value="NR-32">
                              NR-32 - Segurança e Saúde no Trabalho em Serviços de Saúde
                            </SelectItem>
                            <SelectItem value="NR-33">
                              NR-33 - Segurança e Saúde nos Trabalhos em Espaços Confinados
                            </SelectItem>
                            <SelectItem value="NR-34">
                              NR-34 - Condições e Meio Ambiente de Trabalho na Indústria da
                              Construção, Reparação e Desmonte Naval
                            </SelectItem>
                            <SelectItem value="NR-35">NR-35 - Trabalho em Altura</SelectItem>
                            <SelectItem value="NR-36">
                              NR-36 - Segurança e Saúde no Trabalho em Empresas de Abate e
                              Processamento de Carnes e Derivados
                            </SelectItem>
                            <SelectItem value="NR-37">
                              NR-37 - Segurança e Saúde em Plataformas de Petróleo
                            </SelectItem>
                            <SelectItem value="NR-38">
                              NR-38 - Segurança e Saúde no Trabalho nas Atividades de Limpeza Urbana
                              e Manuseio de Resíduos Sólidos
                            </SelectItem>
                            <SelectItem value="outro">Outro (Personalizado)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Lista dinâmica de treinamentos */}
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold">Treinamentos realizados</p>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const sel = (form.treinamentoSelecionado ?? "").trim();
                            if (!sel) {
                              toast.error("Selecione um treinamento na listbox acima");
                              return;
                            }
                            if (sel === "outro") {
                              setTreinamentos((prev) => [...prev, novoTreinamento()]);
                              setForm((prev: any) => ({ ...prev, treinamentoSelecionado: "" }));
                              return;
                            }
                            if (treinamentos.some((t) => t.nome === sel)) {
                              toast.warning("Treinamento já adicionado");
                              return;
                            }
                            setTreinamentos((prev) => {
                              // se houver apenas 1 card vazio, preenche ele ao invés de criar outro
                              if (
                                prev.length === 1 &&
                                !prev[0].nome.trim() &&
                                !prev[0].data_realizacao &&
                                !prev[0].data_validade
                              ) {
                                return [novoTreinamentoWithNome(sel)];
                              }
                              return [...prev, novoTreinamentoWithNome(sel)];
                            });
                            setForm((prev: any) => ({ ...prev, treinamentoSelecionado: "" }));
                          }}
                        >
                          <Plus className="h-3 w-3 mr-1" /> Adicionar treinamento
                        </Button>
                      </div>
                      <div className="space-y-2">
                        {treinamentos.map((t, i) => (
                          <div
                            key={t.id}
                            className="rounded-lg border p-3 space-y-2 bg-muted/10 relative"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-medium text-muted-foreground">
                                Treinamento {i + 1}
                              </span>
                              {treinamentos.length > 1 && (
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6"
                                  onClick={() =>
                                    setTreinamentos((prev) => prev.filter((_, idx) => idx !== i))
                                  }
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Nome do treinamento</Label>
                              <Input
                                placeholder="Ex: NR-35, Primeiros Socorros..."
                                value={t.nome}
                                onChange={(e) =>
                                  setTreinamentos((prev) =>
                                    prev.map((x, idx) =>
                                      idx === i ? { ...x, nome: e.target.value } : x,
                                    ),
                                  )
                                }
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-1">
                                <Label className="text-xs">Data de realização</Label>
                                <Input
                                  type="date"
                                  value={t.data_realizacao}
                                  onChange={(e) =>
                                    setTreinamentos((prev) =>
                                      prev.map((x, idx) =>
                                        idx === i ? { ...x, data_realizacao: e.target.value } : x,
                                      ),
                                    )
                                  }
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Data de validade</Label>
                                <Input
                                  type="date"
                                  value={t.data_validade}
                                  onChange={(e) =>
                                    setTreinamentos((prev) =>
                                      prev.map((x, idx) =>
                                        idx === i ? { ...x, data_validade: e.target.value } : x,
                                      ),
                                    )
                                  }
                                />
                                {t.data_validade && (
                                  <span
                                    className={
                                      diasParaVencimento(t.data_validade) <= -1
                                        ? "text-destructive"
                                        : diasParaVencimento(t.data_validade) <= 30
                                          ? "text-warning"
                                          : "text-success"
                                    }
                                  >
                                    {(diasParaVencimento(t.data_validade) <= -1 ? "EXPIRADO" : "") +
                                      (diasParaVencimento(t.data_validade) <= 30 &&
                                      diasParaVencimento(t.data_validade) > -1
                                        ? " (vence em breve)"
                                        : "")}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>

                <DialogFooter>
                  <Button type="submit" disabled={upsert.isPending}>
                    {upsert.isPending ? "Salvando..." : "Salvar"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card className="p-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <Input
            placeholder="Buscar nome, função, CPF..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          <Select value={fStatus} onValueChange={(v) => setFStatus(v as any)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="ativos">Ativos</SelectItem>
              <SelectItem value="inativos">Inativos</SelectItem>
            </SelectContent>
          </Select>
          <Select value={fObra} onValueChange={(v) => setFObra(v)}>
            <SelectTrigger>
              <SelectValue placeholder="Obra" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as obras</SelectItem>
              {obras.map((o: any) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={fVenc} onValueChange={(v) => setFVenc(v as any)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas validades</SelectItem>
              <SelectItem value="vencidos">Com vencidos</SelectItem>
              <SelectItem value="proximos">Vence em 30 dias</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            onClick={() => {
              setBusca("");
              setFStatus("todos");
              setFObra("todas");
              setFVenc("todos");
            }}
          >
            Limpar
          </Button>
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
                  <TableHead>Matrícula</TableHead>
                  <TableHead>Cidade</TableHead>
                  <TableHead className="w-24 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      Carregando...
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      Nenhum funcionário encontrado.
                    </TableCell>
                  </TableRow>
                )}
                {filtered.map((f: any) => {
                  const abertos = countVencimentosAbertos(f);
                  const listaTrein = treinamentosPorFuncionario.get(f.id) ?? [];
                  const treinListaFallback =
                    listaTrein.length === 0 && f.vencimento_treinamento
                      ? [{ nome: "", data_validade: f.vencimento_treinamento } as TreinamentoItem]
                      : (listaTrein as unknown as TreinamentoItem[]);
                  const treinAbertos = countTreinamentosAbertos(treinListaFallback);
                  return (
                    <TableRow
                      key={f.id}
                      id={`func-${f.id}`}
                      className={cn(highlightId === f.id && "bg-primary/10 ring-1 ring-primary")}
                    >
                      <TableCell>
                        <div className="font-medium">{f.nome}</div>
                        <div className="text-xs text-muted-foreground">{f.email}</div>
                      </TableCell>
                      <TableCell>
                        <div>{f.funcao ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{f.setor}</div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {obras.find((o: any) => o.id === f.obra_id)?.nome ?? (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>{f.cpf ?? "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {safeFormatDate(f.data_admissao, "dd/MM/yyyy")}
                      </TableCell>
                      <TableCell>{f.telefone ?? "—"}</TableCell>
                      <TableCell>{f.matricula ?? "—"}</TableCell>
                      <TableCell>{f.cidade ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {(abertos.proximos > 0 ||
                            abertos.vencidos > 0 ||
                            treinAbertos.proximos > 0 ||
                            treinAbertos.vencidos > 0) && (
                            <span className="mr-1 inline-flex items-center gap-1.5">
                              {abertos.proximos > 0 && (
                                <span
                                  title={`${abertos.proximos} vencimento(s) próximo(s)`}
                                  className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-xs font-semibold leading-none text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-400"
                                >
                                  <Bell className="h-3.5 w-3.5 shrink-0" /> {abertos.proximos}
                                </span>
                              )}
                              {abertos.vencidos > 0 && (
                                <span
                                  title={`${abertos.vencidos} vencimento(s) vencido(s)`}
                                  className="inline-flex items-center gap-1 rounded-full border border-red-300 bg-red-100 px-2 py-0.5 text-xs font-semibold leading-none text-red-700 dark:border-red-500/40 dark:bg-red-500/15 dark:text-red-400"
                                >
                                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />{" "}
                                  {abertos.vencidos}
                                </span>
                              )}
                              {treinAbertos.proximos > 0 && (
                                <span
                                  title={`${treinAbertos.proximos} treinamento(s) a vencer em 30 dias`}
                                  className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-xs font-semibold leading-none text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-400"
                                >
                                  <ClipboardList className="h-3.5 w-3.5 shrink-0" />{" "}
                                  {treinAbertos.proximos}
                                </span>
                              )}
                              {treinAbertos.vencidos > 0 && (
                                <span
                                  title={`${treinAbertos.vencidos} treinamento(s) vencido(s)`}
                                  className="inline-flex items-center gap-1 rounded-full border border-red-300 bg-red-100 px-2 py-0.5 text-xs font-semibold leading-none text-red-700 dark:border-red-500/40 dark:bg-red-500/15 dark:text-red-400"
                                >
                                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />{" "}
                                  {treinAbertos.vencidos}
                                </span>
                              )}
                            </span>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Documentos"
                            onClick={() => setDocsFor(f)}
                          >
                            <FileText className="h-4 w-4" />
                          </Button>
                          {canEdit && (
                            <Button
                              size="icon"
                              variant="ghost"
                              title="Editar"
                              onClick={() => openEdit(f)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {canDelete && (
                            <Button
                              size="icon"
                              variant="ghost"
                              title="Excluir"
                              onClick={() => setFuncionarioToDelete(f)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
        <TabsContent value="vencimentos">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Função / Setor</TableHead>
                  <TableHead>ASO</TableHead>
                  <TableHead>Férias</TableHead>
                  <TableHead>Folgas</TableHead>
                  <TableHead>Experiência</TableHead>
                  <TableHead>Treinamentos</TableHead>
                  <TableHead className="w-24 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      Carregando...
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      Nenhum funcionário encontrado.
                    </TableCell>
                  </TableRow>
                )}
                {filtered.map((f: any) => (
                  <TableRow
                    key={f.id}
                    id={`func-${f.id}`}
                    className={cn(highlightId === f.id && "bg-primary/10 ring-1 ring-primary")}
                  >
                    <TableCell className="font-medium">{f.nome}</TableCell>
                    <TableCell>
                      <div>{f.funcao ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{f.setor ?? "—"}</div>
                    </TableCell>
                    {[
                      "vencimento_aso",
                      "vencimento_ferias",
                      "vencimento_folga_campo",
                    ].map((key) => (
                      <TableCell
                        key={key}
                        className={cn("text-xs whitespace-nowrap", vencColor(f[key]))}
                      >
                        {safeFormatDate(f[key], "dd/MM/yyyy")}
                      </TableCell>
                    ))}
                    <TableCell
                      className={cn(
                        "text-xs whitespace-nowrap",
                        isExperienciaConcluida(f)
                          ? "text-success font-semibold"
                          : vencColor(f.vencimento_experiencia),
                      )}
                    >
                      {isExperienciaConcluida(f)
                        ? "Concluído"
                        : safeFormatDate(f.vencimento_experiencia, "dd/MM/yyyy")}
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const lista = treinamentosPorFuncionario.get(f.id) ?? [];
                        const fallback =
                          lista.length === 0 && f.vencimento_treinamento
                            ? [{ nome: "", data_validade: f.vencimento_treinamento }]
                            : lista;
                        if (fallback.length === 0)
                          return <span className="text-muted-foreground text-xs">—</span>;
                        return (
                          <div className="flex flex-col gap-1">
                            {fallback.map((t: any, idx: number) => (
                              <span
                                key={idx}
                                className={cn(
                                  "text-xs whitespace-nowrap",
                                  vencColor(t.data_validade),
                                )}
                                title={
                                  t.nome
                                    ? `${t.nome} - ${safeFormatDate(t.data_validade, "dd/MM/yyyy")}`
                                    : safeFormatDate(t.data_validade, "dd/MM/yyyy")
                                }
                              >
                                {t.nome ? `${t.nome}: ` : ""}
                                {safeFormatDate(t.data_validade, "dd/MM/yyyy")}
                              </span>
                            ))}
                          </div>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Documentos"
                          onClick={() => setDocsFor(f)}
                        >
                          <FileText className="h-4 w-4" />
                        </Button>
                        {canEdit && (
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Editar"
                            onClick={() => openEdit(f)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      <DocumentosDialog
        funcionario={docsFor}
        onClose={() => setDocsFor(null)}
        canEdit={canEdit}
        canDelete={canDelete}
      />

      <AlertDialog
        open={!!funcionarioToDelete}
        onOpenChange={(o) => !o && setFuncionarioToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir funcionário?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir{" "}
              <span className="font-semibold text-foreground">{funcionarioToDelete?.nome}</span>?
              Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setFuncionarioToDelete(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (funcionarioToDelete) remove.mutate(funcionarioToDelete.id);
                setFuncionarioToDelete(null);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DocumentosDialog({
  funcionario,
  onClose,
  canEdit,
  canDelete,
}: {
  funcionario: any;
  onClose: () => void;
  canEdit: boolean;
  canDelete: boolean;
}) {
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
    onSuccess: () => {
      toast.success("Documento enviado");
      qc.invalidateQueries({ queryKey: ["funcionario-documentos", funcionario?.id] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const delDoc = useMutation({
    mutationFn: async (doc: any) => {
      await supabase.storage.from("anexos").remove([doc.storage_path]);
      const { error } = await (supabase as any)
        .from("funcionario_documentos")
        .delete()
        .eq("id", doc.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Documento removido");
      qc.invalidateQueries({ queryKey: ["funcionario-documentos", funcionario?.id] });
    },
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
            <Input
              type="file"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  addDoc.mutate(f);
                  e.target.value = "";
                }
              }}
              disabled={addDoc.isPending}
            />
            <p className="text-xs text-muted-foreground mt-1">
              PDF, imagem ou qualquer arquivo até 50MB.
            </p>
          </div>
        )}
        <div className="border rounded mt-2">
          {isLoading && (
            <div className="p-4 text-sm text-muted-foreground text-center">Carregando...</div>
          )}
          {!isLoading && docs.length === 0 && (
            <div className="p-4 text-sm text-muted-foreground text-center">
              Nenhum documento ainda.
            </div>
          )}
          {docs.map((d: any) => (
            <div
              key={d.id}
              className="flex items-center justify-between gap-2 p-2 border-b last:border-b-0"
            >
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <div className="text-sm truncate">{d.nome}</div>
                  <div className="text-xs text-muted-foreground">
                    {safeFormatDate(d.created_at, "dd/MM/yy HH:mm")}{" "}
                    {d.tamanho ? `· ${Math.round(d.tamanho / 1024)} KB` : ""}
                  </div>
                </div>
              </div>
              <div className="flex gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  title="Baixar"
                  onClick={() => handleDownload(d)}
                >
                  <Download className="h-4 w-4" />
                </Button>
                {canDelete && (
                  <Button
                    size="icon"
                    variant="ghost"
                    title="Excluir"
                    onClick={() => {
                      if (confirm(`Excluir ${d.nome}?`)) delDoc.mutate(d);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
