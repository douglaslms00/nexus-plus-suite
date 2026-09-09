import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Users,
  CheckSquare,
  HardHat,
  AlertTriangle,
  Package,
  CalendarClock,
  Wallet,
  ShieldCheck,
  MapPin,
  ClipboardCheck,
  FileDown,
  FileText,
  ArrowUpDown,
  Search,
  ExternalLink,
  RefreshCw,
  Clock,
  PlusCircle,
  Wrench,
  CheckCircle2,
  Calendar,
  AlertCircle,
  Phone,
  Building,
  TrendingDown,
  Sparkles,
} from "lucide-react";
import { cn, safeFormatDate, safeParseISO } from "@/lib/utils";
import { isAdmin, useUserRoles, useModulePerm } from "@/lib/permissions";
import { useObraAtual } from "@/lib/obra-context.types";
import { VENC_FIELDS, computeConformidade, type Status } from "@/lib/conformidade";
import { differenceInDays } from "date-fns";
import { toast } from "sonner";

function DashboardErrorFallback({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="max-w-lg w-full text-center rounded-lg border bg-card p-6 shadow-sm">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <h2 className="text-lg font-semibold">Falha ao carregar o Dashboard</h2>
        <p className="mt-2 text-sm text-muted-foreground break-words">
          {error?.message ?? "Erro inesperado ao montar o painel."}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Os demais módulos continuam funcionando. Use o botão abaixo para tentar novamente ou verifique o console do
          navegador (F12) para mais detalhes.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Button onClick={() => reset()} className="gap-1">
            <RefreshCw className="h-3.5 w-3.5" /> Tentar novamente
          </Button>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Recarregar página
          </Button>
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
  errorComponent: DashboardErrorFallback,
});

function colunasMissing(msg: string): string[] {
  const out: string[] = [];
  const re = /Could not find the '([^']+)' column of '[^']+'\s*in the schema cache/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(msg))) out.push(m[1]);
  return out;
}

function logDashWarn(scope: string, err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  console.warn(`[dashboard:${scope}]`, msg);
}

function StatusDot({ status }: { status: Status }) {
  return (
    <span
      className={cn(
        "inline-block h-2.5 w-2.5 rounded-full shrink-0",
        status === "verde" && "bg-emerald-500 shadow-sm shadow-emerald-500/50",
        status === "amarelo" && "bg-amber-500 shadow-sm shadow-amber-500/50",
        status === "vermelho" && "bg-rose-500 shadow-sm shadow-rose-500/50",
      )}
    />
  );
}

const PAGE_SIZE = 10;
type SortKey = "nome" | "status";
const PIOR_RANK: Record<Status, number> = { vermelho: 0, amarelo: 1, verde: 2 };

type DashboardTab = "alertas" | "vencimentos" | "estoques" | "tarefas" | "financeiro" | "equipamentos";

function DashboardPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: roles } = useUserRoles();
  const { obraId } = useObraAtual();

  // Permissões
  const permFunc = useModulePerm("funcionarios");
  const permEpi = useModulePerm("epis");
  const permMat = useModulePerm("materiais");
  const permTarefas = useModulePerm("tarefas");
  const permFin = useModulePerm("financeiro");

  // Estado geral de navegação e filtros
  const [activeTab, setActiveTab] = useState<DashboardTab>("alertas");
  const [searchTerm, setSearchTerm] = useState("");
  const [confTab, setConfTab] = useState<"pendentes" | "em_dia" | "todos">("pendentes");
  const [confFieldFilter, setConfFieldFilter] = useState<string>("todos");
  const [stockFilter, setStockFilter] = useState<"todos" | "epis" | "materiais" | "zerados">("todos");
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("status");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Modais interativos
  const [selectedFuncionario, setSelectedFuncionario] = useState<any | null>(null);
  const [renewField, setRenewField] = useState<string>("vencimento_aso");
  const [renewDate, setRenewDate] = useState<string>("");

  const [selectedStockItem, setSelectedStockItem] = useState<{
    id: string;
    tipoItem: "epi" | "material";
    nome: string;
    subtipo?: string;
    ca?: string | null;
    unidade?: string;
    estoque_atual: number;
    estoque_minimo: number;
  } | null>(null);
  const [stockEntryQtd, setStockEntryQtd] = useState<number>(1);
  const [stockEntryObs, setStockEntryObs] = useState("");
  const [stockEntryObra, setStockEntryObra] = useState<string>(obraId || "");

  // 1. Obras — somente no cliente para evitar SSR abortIncoming (fetch Supabase no servidor)
  const isClient = typeof window !== "undefined";
  const {
    data: obras = [],
    error: obrasError,
  } = useQuery({
    queryKey: ["dash-obras"],
    staleTime: 1000 * 60 * 5,
    retry: 1,
    enabled: isClient,
    queryFn: async () => {
      if (typeof window === "undefined") return [];
      const { data, error } = await supabase.from("obras").select("id, nome").order("nome");
      if (error) {
        logDashWarn("obras", error);
        // Fallback silencioso: retorna vazio em vez de quebrar todo o dashboard
        return [];
      }
      return data ?? [];
    },
  });
  const obraAtualNome = obraId ? obras.find((o: any) => o.id === obraId)?.nome : null;

  // 2. Funcionários — tolerante a colunas que não existem mais no schema (ex.: vencimento_treinamento)
  const {
    data: funcionarios = [],
    isLoading: loadingFunc,
    error: funcionariosError,
  } = useQuery({
    queryKey: ["dash-funcionarios", obraId],
    retry: 1,
    enabled: isClient,
    queryFn: async () => {
      if (typeof window === "undefined") return [];
      const baseSelect =
        "id, nome, ativo, obra_id, funcao, setor, telefone, email, cpf, data_admissao, vencimento_aso, vencimento_treinamento, vencimento_folga_campo, vencimento_ferias, vencimento_ficha_epi, vencimento_experiencia, experiencia_concluida";
      const trySelect = async (sel: string) => {
        let q: any = supabase.from("funcionarios").select(sel).eq("ativo", true).order("nome");
        if (obraId) q = q.eq("obra_id", obraId);
        return await q;
      };
      let { data, error } = await trySelect(baseSelect);
      if (error) {
        const miss = colunasMissing(error.message ?? "");
        if (miss.length > 0) {
          logDashWarn("funcionarios-missing-cols", `${miss.join(", ")} — tentando fallback com select("*")`);
          // Fallback 1: select("*") — funciona mesmo se o cache do PostgREST estiver desatualizado
          const fb = await (async () => {
            let q: any = supabase.from("funcionarios").select("*").eq("ativo", true).order("nome");
            if (obraId) q = q.eq("obra_id", obraId);
            return await q;
          })();
          if (!fb.error) return fb.data ?? [];
          // Fallback 2: remove colunas faltantes e tenta de novo
          const filtered = baseSelect
            .split(",")
            .map((s) => s.trim())
            .filter((c) => !miss.includes(c))
            .join(", ");
          const retry = await trySelect(filtered);
          if (!retry.error) return retry.data ?? [];
          logDashWarn("funcionarios", retry.error);
          return [];
        }
        logDashWarn("funcionarios", error);
        return [];
      }
      return data ?? [];
    },
  });

  // Treinamentos de NR detalhados dos funcionários
  const { data: allTreinamentos = [], error: treinamentosError } = useQuery({
    queryKey: ["dash-treinamentos", obraId],
    enabled: isClient && funcionarios.length > 0,
    staleTime: 1000 * 60 * 2,
    retry: 1,
    queryFn: async () => {
      if (typeof window === "undefined") return [];
      const ids = funcionarios.map((f: any) => f.id);
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from("funcionario_treinamentos")
        .select("id, funcionario_id, nome, data_validade, data_realizacao")
        .in("funcionario_id", ids);
      if (error) {
        logDashWarn("treinamentos", error);
        return [];
      }
      return data ?? [];
    },
  });

  const treinamentosPorFuncionario = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const t of allTreinamentos) {
      const list = map.get(t.funcionario_id) ?? [];
      list.push(t);
      map.set(t.funcionario_id, list);
    }
    return map;
  }, [allTreinamentos]);

  // 3. Tarefas
  const { data: tarefas = [], error: tarefasError } = useQuery({
    queryKey: ["dash-tarefas", obraId],
    retry: 1,
    enabled: isClient,
    queryFn: async () => {
      if (typeof window === "undefined") return [];
      const { data, error } = await supabase
        .from("tarefas")
        .select("id, status, titulo, descricao, prioridade, data_vencimento")
        .neq("status", "concluida")
        .order("data_vencimento", { ascending: true })
        .limit(100);
      if (error) {
        logDashWarn("tarefas", error);
        // Fallback: tenta select(*) se coluna não existir mais
        const miss = colunasMissing(error.message ?? "");
        if (miss.length > 0) {
          const fb = await supabase.from("tarefas").select("*").neq("status", "concluida").limit(100);
          if (!fb.error) return fb.data ?? [];
        }
        return [];
      }
      return data ?? [];
    },
  });

  // 4. EPIs
  const { data: epis = [], error: episError } = useQuery({
    queryKey: ["dash-epis"],
    staleTime: 1000 * 60 * 2,
    retry: 1,
    enabled: isClient,
    queryFn: async () => {
      if (typeof window === "undefined") return [];
      const { data, error } = await supabase
        .from("epis")
        .select("id, nome, tipo, ca, estoque_atual, estoque_minimo, validade_meses")
        .eq("ativo", true)
        .order("nome")
        .limit(300);
      if (error) {
        logDashWarn("epis", error);
        const fb = await supabase.from("epis").select("*").eq("ativo", true).limit(300);
        if (!fb.error) return fb.data ?? [];
        return [];
      }
      return data ?? [];
    },
  });

  // 5. Materiais
  const { data: materiais = [], error: materiaisError } = useQuery({
    queryKey: ["dash-mat"],
    staleTime: 1000 * 60 * 2,
    retry: 1,
    enabled: isClient,
    queryFn: async () => {
      if (typeof window === "undefined") return [];
      const { data, error } = await supabase
        .from("materiais")
        .select("id, nome, codigo, unidade, preco_medio, estoque_atual, estoque_minimo")
        .eq("ativo", true)
        .order("nome")
        .limit(300);
      if (error) {
        logDashWarn("materiais", error);
        const fb = await supabase.from("materiais").select("*").eq("ativo", true).limit(300);
        if (!fb.error) return fb.data ?? [];
        return [];
      }
      return data ?? [];
    },
  });

  // 6. Contas Financeiras a Pagar
  const { data: contas = [], error: contasError } = useQuery({
    queryKey: ["dash-contas", obraId],
    retry: 1,
    enabled: isClient,
    queryFn: async () => {
      if (typeof window === "undefined") return [];
      let q = supabase
        .from("contas_financeiras")
        .select("id, tipo, status, descricao, valor, data_vencimento, obra_id")
        .neq("status", "pago")
        .order("data_vencimento", { ascending: true })
        .limit(200);
      if (obraId) q = q.eq("obra_id", obraId);
      const { data, error } = await q;
      if (error) {
        logDashWarn("contas", error);
        const miss = colunasMissing(error.message ?? "");
        if (miss.length > 0) {
          let q2: any = supabase.from("contas_financeiras").select("*").neq("status", "pago").limit(200);
          if (obraId) q2 = q2.eq("obra_id", obraId);
          const fb = await q2;
          if (!fb.error) return fb.data ?? [];
        }
        return [];
      }
      return data ?? [];
    },
  });

  // 7. Ferramentas (manutenções e empréstimos em aberto)
  const { data: ferramentasAlertas = [], error: ferramentasError } = useQuery({
    queryKey: ["dash-ferramentas", obraId],
    retry: 1,
    enabled: isClient,
    queryFn: async () => {
      if (typeof window === "undefined") return [];
      let q = supabase
        .from("ferramentas")
        .select("id, nome, codigo, estado, proxima_manutencao, obra_id")
        .not("proxima_manutencao", "is", null);
      if (obraId) q = q.eq("obra_id", obraId);
      const { data, error } = await q;
      if (error) {
        logDashWarn("ferramentas", error);
        return [];
      }
      const hoje = new Date();
      return (data ?? []).filter((f: any) => {
        if (!f.proxima_manutencao) return false;
        try {
          const dias = differenceInDays(safeParseISO(f.proxima_manutencao), hoje);
          return dias <= 30; // Vencida ou nos próximos 30 dias
        } catch {
          return false;
        }
      });
    },
  });

  const { data: emprestimosAtrasados = [], error: emprestimosError } = useQuery({
    queryKey: ["dash-emprestimos", obraId],
    retry: 1,
    enabled: isClient,
    queryFn: async () => {
      if (typeof window === "undefined") return [];
      const { data, error } = await supabase
        .from("ferramenta_emprestimos")
        .select("id, data_emprestimo, prevista_devolucao, data_devolucao, ferramentas(nome), funcionarios(nome)")
        .is("data_devolucao", null)
        .not("prevista_devolucao", "is", null);
      if (error) {
        logDashWarn("emprestimos", error);
        return [];
      }
      const hoje = new Date();
      return (data ?? []).filter((e: any) => {
        if (!e.prevista_devolucao) return false;
        try {
          return differenceInDays(safeParseISO(e.prevista_devolucao), hoje) < 0;
        } catch {
          return false;
        }
      });
    },
  });

  // ---------------------------------------------
  // Processamento e Conformidade — com guarda contra dados corruptos
  // ---------------------------------------------
  const conformidade = useMemo(() => {
    try {
      return computeConformidade(funcionarios);
    } catch (e) {
      logDashWarn("conformidade", e);
      return [];
    }
  }, [funcionarios]);

  const dashErrors = useMemo(() => {
    const list: Array<{ key: string; msg: string }> = [];
    const push = (k: string, err: unknown) => {
      if (!err) return;
      const m = err instanceof Error ? err.message : String((err as any)?.message ?? err);
      list.push({ key: k, msg: m });
    };
    push("obras", obrasError);
    push("funcionarios", funcionariosError);
    push("treinamentos", treinamentosError);
    push("tarefas", tarefasError);
    push("epis", episError);
    push("materiais", materiaisError);
    push("contas", contasError);
    push("ferramentas", ferramentasError);
    push("emprestimos", emprestimosError);
    // Filtra erros que já foram tratados com fallback silencioso (mensagem vazia)
    return list.filter((e) => e.msg && e.msg.trim().length > 0);
  }, [
    obrasError,
    funcionariosError,
    treinamentosError,
    tarefasError,
    episError,
    materiaisError,
    contasError,
    ferramentasError,
    emprestimosError,
  ]);

  const alertasVencimento = useMemo(
    () =>
      conformidade.flatMap((c) =>
        c.items
          .filter((i) => i.status && i.status !== "verde")
          .map((i) => ({
            funcionarioId: c.funcionario.id,
            funcionarioNome: c.funcionario.nome,
            funcionario: c.funcionario,
            campoKey: i.key,
            label: i.label,
            data: i.data,
            dias: i.dias!,
            status: i.status!,
          })),
      ),
    [conformidade],
  );

  // EPIs e Materiais abaixo do estoque mínimo
  const epiAbaixoMin = useMemo(
    () =>
      epis
        .filter((e: any) => Number(e.estoque_atual) < Number(e.estoque_minimo))
        .map((e: any) => ({
          ...e,
          tipoItem: "epi" as const,
          deficit: Math.max(0, Number(e.estoque_minimo) - Number(e.estoque_atual)),
          percentual: e.estoque_minimo > 0 ? (e.estoque_atual / e.estoque_minimo) * 100 : 0,
        })),
    [epis],
  );

  const matAbaixoMin = useMemo(
    () =>
      materiais
        .filter((m: any) => Number(m.estoque_atual) < Number(m.estoque_minimo))
        .map((m: any) => ({
          ...m,
          tipoItem: "material" as const,
          deficit: Math.max(0, Number(m.estoque_minimo) - Number(m.estoque_atual)),
          percentual: m.estoque_minimo > 0 ? (m.estoque_atual / m.estoque_minimo) * 100 : 0,
        })),
    [materiais],
  );

  const estoqueCriticoTotal = useMemo(
    () => [...epiAbaixoMin, ...matAbaixoMin],
    [epiAbaixoMin, matAbaixoMin],
  );

  const contasPagar = useMemo(() => contas.filter((c: any) => c.tipo === "pagar"), [contas]);
  const contasVencidas = useMemo(
    () =>
      contasPagar.filter((c: any) => {
        if (!c.data_vencimento) return false;
        return differenceInDays(safeParseISO(c.data_vencimento), new Date()) < 0;
      }),
    [contasPagar],
  );

  const tarefasAtrasadas = useMemo(
    () =>
      tarefas.filter((t: any) => {
        if (!t.data_vencimento) return false;
        return differenceInDays(safeParseISO(t.data_vencimento), new Date()) < 0;
      }),
    [tarefas],
  );

  const alertasAtivos =
    alertasVencimento.length +
    epiAbaixoMin.length +
    matAbaixoMin.length +
    tarefasAtrasadas.length +
    contasVencidas.length +
    ferramentasAlertas.length +
    emprestimosAtrasados.length;

  // ---------------------------------------------
  // Ações Rápidas de Mutação
  // ---------------------------------------------

  // 1. Renovação rápida de vencimento do funcionário
  const renewVencimento = useMutation({
    mutationFn: async () => {
      if (!selectedFuncionario || !renewField || !renewDate) {
        throw new Error("Selecione o documento e a nova data de vencimento.");
      }
      const { error } = await supabase
        .from("funcionarios")
        .update({ [renewField]: renewDate } as never)
        .eq("id", selectedFuncionario.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Vencimento atualizado com sucesso!");
      qc.invalidateQueries({ queryKey: ["dash-funcionarios"] });
      qc.invalidateQueries({ queryKey: ["funcionarios"] });
      // Atualiza funcionário localmente no modal
      setSelectedFuncionario((prev: any) => ({
        ...prev,
        [renewField]: renewDate,
      }));
      setRenewDate("");
    },
    onError: (err: any) => toast.error(err.message || "Erro ao atualizar vencimento"),
  });

  // 2. Reabastecimento rápido de estoque
  const restockItem = useMutation({
    mutationFn: async () => {
      if (!selectedStockItem) return;
      const qtd = Number(stockEntryQtd);
      if (!qtd || qtd <= 0) throw new Error("Informe uma quantidade válida para entrada.");

      if (selectedStockItem.tipoItem === "epi") {
        // Registra movimento de EPI
        const { error: movErr } = await supabase.from("epi_movimentos").insert({
          epi_id: selectedStockItem.id,
          tipo: "entrada",
          quantidade: qtd,
          observacoes: stockEntryObs || "Reabastecimento rápido via Dashboard",
        });
        if (movErr) throw movErr;

        // Atualiza estoque atual
        const novoEstoque = (selectedStockItem.estoque_atual ?? 0) + qtd;
        const { error: updateErr } = await supabase
          .from("epis")
          .update({ estoque_atual: novoEstoque })
          .eq("id", selectedStockItem.id);
        if (updateErr) throw updateErr;
      } else {
        // Registra movimento de Material
        const { error: movErr } = await supabase.from("material_movimentos").insert({
          material_id: selectedStockItem.id,
          tipo: "entrada",
          quantidade: qtd,
          obra_id: stockEntryObra || obraId || null,
          observacoes: stockEntryObs || "Reabastecimento rápido via Dashboard",
          data: new Date().toISOString().split("T")[0],
        });
        if (movErr) throw movErr;

        // Atualiza estoque atual
        const novoEstoque = (Number(selectedStockItem.estoque_atual) || 0) + qtd;
        const { error: updateErr } = await supabase
          .from("materiais")
          .update({ estoque_atual: novoEstoque })
          .eq("id", selectedStockItem.id);
        if (updateErr) throw updateErr;
      }
    },
    onSuccess: () => {
      toast.success(
        `Estoque de ${selectedStockItem?.nome} reabastecido (+${stockEntryQtd}) com sucesso!`,
      );
      qc.invalidateQueries({ queryKey: ["dash-epis"] });
      qc.invalidateQueries({ queryKey: ["dash-mat"] });
      qc.invalidateQueries({ queryKey: ["epis"] });
      qc.invalidateQueries({ queryKey: ["materiais"] });
      setSelectedStockItem(null);
      setStockEntryObs("");
    },
    onError: (err: any) => toast.error(err.message || "Erro ao reabastecer estoque"),
  });

  // 3. Concluir tarefa rapidamente
  const completeTask = useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase
        .from("tarefas")
        .update({
          status: "concluida",
          concluida: true,
          concluida_em: new Date().toISOString(),
        })
        .eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tarefa marcada como concluída!");
      qc.invalidateQueries({ queryKey: ["dash-tarefas"] });
      qc.invalidateQueries({ queryKey: ["tarefas"] });
    },
    onError: (err: any) => toast.error(err.message || "Erro ao concluir tarefa"),
  });

  // 4. Marcar conta como paga
  const payAccount = useMutation({
    mutationFn: async (contaId: string) => {
      const { error } = await supabase
        .from("contas_financeiras")
        .update({
          status: "pago",
          data_pagamento: new Date().toISOString().split("T")[0],
        })
        .eq("id", contaId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Conta liquidada com sucesso!");
      qc.invalidateQueries({ queryKey: ["dash-contas"] });
      qc.invalidateQueries({ queryKey: ["contas-obra"] });
    },
    onError: (err: any) => toast.error(err.message || "Erro ao liquidar conta"),
  });

  // Atualização manual com feedback visual
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["dash-funcionarios"] }),
      qc.invalidateQueries({ queryKey: ["dash-tarefas"] }),
      qc.invalidateQueries({ queryKey: ["dash-epis"] }),
      qc.invalidateQueries({ queryKey: ["dash-mat"] }),
      qc.invalidateQueries({ queryKey: ["dash-contas"] }),
      qc.invalidateQueries({ queryKey: ["dash-ferramentas"] }),
      qc.invalidateQueries({ queryKey: ["dash-emprestimos"] }),
    ]);
    setTimeout(() => {
      setIsRefreshing(false);
      toast.info("Painel sincronizado em tempo real.");
    }, 400);
  };

  // ---------------------------------------------
  // Filtros da Tabela de Conformidade
  // ---------------------------------------------
  const pendentes = conformidade.filter((c) => c.pior !== "verde");
  const emDia = conformidade.filter((c) => c.pior === "verde");

  const baseConformidade = useMemo(() => {
    let list = confTab === "pendentes" ? pendentes : confTab === "em_dia" ? emDia : conformidade;

    // Filtro por campo específico de vencimento
    if (confFieldFilter !== "todos") {
      list = list.filter((c) => {
        const item = c.items.find((i) => i.key === confFieldFilter);
        return item && item.status && item.status !== "verde";
      });
    }

    // Busca textual
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter((c) =>
        (c.funcionario.nome ?? "").toLowerCase().includes(q) ||
        ((c.funcionario as any).funcao ?? "").toLowerCase().includes(q) ||
        ((c.funcionario as any).setor ?? "").toLowerCase().includes(q),
      );
    }

    return list;
  }, [confTab, confFieldFilter, searchTerm, pendentes, emDia, conformidade]);

  const sortedConformidade = useMemo(() => {
    const arr = [...baseConformidade];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "nome") {
        cmp = (a.funcionario.nome ?? "").localeCompare(b.funcionario.nome ?? "");
      } else {
        cmp = PIOR_RANK[a.pior] - PIOR_RANK[b.pior];
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [baseConformidade, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sortedConformidade.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const pagedConformidade = sortedConformidade.slice(
    (pageSafe - 1) * PAGE_SIZE,
    pageSafe * PAGE_SIZE,
  );

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(k);
      setSortDir("asc");
    }
    setPage(1);
  };

  // Exportações
  const exportRows = () => {
    const headers = ["Funcionário", "Status geral", ...VENC_FIELDS.map((f) => f.label)];
    const rows = sortedConformidade.map((c) => [
      c.funcionario.nome,
      c.pior === "verde" ? "Em dia" : c.pior === "amarelo" ? "Vence em breve" : "Vencido",
      ...c.items.map((i) =>
        i.data ? `${safeFormatDate(i.data, "dd/MM/yyyy")} (${i.status})` : "—",
      ),
    ]);
    return { headers, rows };
  };

  const obraTag = obraAtualNome ? `-${obraAtualNome.replace(/\s+/g, "_")}` : "";
  const onCSV = async () => {
    const { exportCSV } = await import("@/lib/exports");
    const { headers, rows } = exportRows();
    exportCSV(`conformidade${obraTag}`, headers, rows);
  };
  const onPDF = async () => {
    const { exportPDF } = await import("@/lib/exports");
    const { headers, rows } = exportRows();
    await exportPDF(
      `Conformidade${obraAtualNome ? ` - ${obraAtualNome}` : ""}`,
      headers,
      rows,
      `conformidade${obraTag}`,
    );
  };

  // ---------------------------------------------
  // Indicadores KPI Interativos
  // ---------------------------------------------
  const indicadores = [
    {
      id: "alertas" as const,
      label: "Alertas Ativos",
      sublabel: "Urgências críticas",
      valor: alertasAtivos,
      icon: AlertTriangle,
      status: alertasAtivos === 0 ? "verde" : alertasAtivos > 5 ? "vermelho" : "amarelo",
      route: null,
      tab: "alertas" as const,
    },
    {
      id: "vencimentos" as const,
      label: "Vencimentos RH",
      sublabel: `${alertasVencimento.length} pendência${alertasVencimento.length === 1 ? "" : "s"}`,
      valor: alertasVencimento.length,
      icon: Users,
      status: alertasVencimento.length === 0 ? "verde" : ("vermelho" as const),
      route: "/funcionarios?venc=vencidos",
      tab: "vencimentos" as const,
    },
    {
      id: "epis" as const,
      label: "EPIs em Baixa",
      sublabel: "Abaixo do estoque mín.",
      valor: epiAbaixoMin.length,
      icon: HardHat,
      status: epiAbaixoMin.length === 0 ? "verde" : ("vermelho" as const),
      route: "/epis?soBaixo=true",
      tab: "estoques" as const,
      subfilter: "epis" as const,
    },
    {
      id: "materiais" as const,
      label: "Materiais em Baixa",
      sublabel: "Abaixo do estoque mín.",
      valor: matAbaixoMin.length,
      icon: Package,
      status: matAbaixoMin.length === 0 ? "verde" : ("vermelho" as const),
      route: "/materiais?soBaixo=true",
      tab: "estoques" as const,
      subfilter: "materiais" as const,
    },
    {
      id: "tarefas" as const,
      label: "Tarefas Pendentes",
      sublabel: `${tarefasAtrasadas.length} atrasada${tarefasAtrasadas.length === 1 ? "" : "s"}`,
      valor: tarefas.length,
      icon: CheckSquare,
      status: tarefasAtrasadas.length > 0 ? "vermelho" : tarefas.length > 0 ? "amarelo" : "verde",
      route: "/tarefas",
      tab: "tarefas" as const,
    },
    {
      id: "financeiro" as const,
      label: "Contas a Pagar",
      sublabel: `${contasVencidas.length} vencida${contasVencidas.length === 1 ? "" : "s"}`,
      valor: contasPagar.length,
      icon: Wallet,
      status: contasVencidas.length > 0 ? "vermelho" : contasPagar.length > 0 ? "amarelo" : "verde",
      route: "/financeiro",
      tab: "financeiro" as const,
    },
  ];

  const handleKpiClick = (ind: (typeof indicadores)[number]) => {
    setActiveTab(ind.tab);
    if ("subfilter" in ind && ind.subfilter) {
      setStockFilter(ind.subfilter);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header com Status e Controles Globais */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Dashboard</h1>
            <Badge variant="outline" className="gap-1 text-xs border-primary/30 text-primary">
              <Sparkles className="h-3 w-3" /> Interativo
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Monitoramento operacional e ações diretas em tempo real.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium shadow-sm transition-all",
              obraId
                ? "bg-primary/10 border-primary/30 text-primary"
                : "bg-muted text-muted-foreground",
            )}
          >
            <MapPin className="h-3.5 w-3.5" />
            <span>{obraAtualNome ?? "Todas as obras"}</span>
          </div>

          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 shadow-sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin text-primary")} />
            <span>Atualizar</span>
          </Button>

          <Button size="sm" variant="outline" onClick={onCSV} title="Exportar Conformidade em CSV">
            <FileDown className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">CSV</span>
          </Button>
          <Button size="sm" variant="outline" onClick={onPDF} title="Exportar Relatório em PDF">
            <FileText className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">PDF</span>
          </Button>
        </div>
      </div>

      {isAdmin(roles) && (
        <Card className="p-3.5 flex items-center justify-between bg-primary/5 border-primary/20 shadow-sm">
          <div className="flex items-center gap-2 text-sm text-foreground">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <span>
              Modo Administrador: todas as ações e renovações imediatas estão habilitadas.
            </span>
          </div>
          <Link to="/acessos" className="text-xs font-semibold text-primary hover:underline">
            Gerenciar acessos &rarr;
          </Link>
        </Card>
      )}

      {/* Aviso de degradação parcial — mostra qual consulta falhou sem quebrar a tela inteira */}
      {dashErrors.length > 0 && (
        <Card className="p-3 border-amber-300 bg-amber-50/60 dark:bg-amber-950/20 dark:border-amber-800">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                Alguns dados do Dashboard não puderam ser carregados. O painel continua funcionando com dados parciais.
              </p>
              <ul className="mt-1.5 space-y-1">
                {dashErrors.map((e) => (
                  <li key={e.key} className="text-[11px] text-amber-700 dark:text-amber-400 break-words">
                    <span className="font-mono font-semibold">{e.key}:</span> {e.msg.slice(0, 220)}
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex gap-2">
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleRefresh}>
                  <RefreshCw className="h-3 w-3 mr-1" /> Tentar novamente
                </Button>
                <span className="text-[11px] text-muted-foreground self-center">
                  Veja também o console do navegador (F12) para detalhes completos.
                </span>
              </div>
            </div>
          </div>
        </Card>
      )}

      {(loadingFunc) && funcionarios.length === 0 && !funcionariosError ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-primary" />
          Carregando dados do dashboard...
        </Card>
      ) : null}

      {/* Cards de Indicadores Interativos (KPIs) */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {indicadores.map((ind) => {
          const isActive = activeTab === ind.tab;
          return (
            <div
              key={ind.id}
              role="button"
              tabIndex={0}
              onClick={() => handleKpiClick(ind)}
              onKeyDown={(e) => e.key === "Enter" && handleKpiClick(ind)}
              className={cn(
                "group relative text-left rounded-xl border bg-card p-4 transition-all duration-200 cursor-pointer select-none shadow-sm hover:shadow-md hover:-translate-y-0.5",
                isActive
                  ? "border-primary ring-2 ring-primary/20 shadow-primary/5 bg-primary/[0.02]"
                  : "hover:border-muted-foreground/30",
              )}
            >
              {/* Barra superior de status */}
              <div
                className={cn(
                  "absolute top-0 left-0 h-1 w-full rounded-t-xl transition-all",
                  ind.status === "verde" && "bg-emerald-500",
                  ind.status === "amarelo" && "bg-amber-500",
                  ind.status === "vermelho" && "bg-rose-500",
                )}
              />

              <div className="flex items-start justify-between gap-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {ind.label}
                </span>
                <div className="flex items-center gap-1">
                  {ind.route && (
                    <Link
                      to={ind.route as any}
                      onClick={(e) => e.stopPropagation()}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-muted-foreground hover:text-foreground"
                      title="Abrir página completa"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  )}
                  <ind.icon
                    className={cn(
                      "h-4 w-4 transition-colors",
                      isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
                    )}
                  />
                </div>
              </div>

              <div className="mt-3 flex items-baseline justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold tracking-tight">{ind.valor}</span>
                  <StatusDot status={ind.status as Status} />
                </div>
                <span className="text-[11px] text-muted-foreground truncate max-w-[90px]">
                  {ind.sublabel}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Espaço de Trabalho Interativo com Abas */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as DashboardTab)}
        className="space-y-4"
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between border-b pb-3">
          <TabsList className="h-10 p-1 bg-muted/60">
            <TabsTrigger value="alertas" className="gap-1.5 text-xs font-medium">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
              Alertas Críticos
              {alertasAtivos > 0 && (
                <Badge variant="destructive" className="h-4 px-1 text-[10px] ml-1">
                  {alertasAtivos}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="vencimentos" className="gap-1.5 text-xs font-medium">
              <CalendarClock className="h-3.5 w-3.5" />
              Vencimentos RH
              {alertasVencimento.length > 0 && (
                <Badge variant="secondary" className="h-4 px-1 text-[10px] ml-1">
                  {alertasVencimento.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="estoques" className="gap-1.5 text-xs font-medium">
              <Package className="h-3.5 w-3.5" />
              Estoques Críticos
              {estoqueCriticoTotal.length > 0 && (
                <Badge variant="secondary" className="h-4 px-1 text-[10px] ml-1">
                  {estoqueCriticoTotal.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="tarefas" className="gap-1.5 text-xs font-medium">
              <CheckSquare className="h-3.5 w-3.5" />
              Tarefas
            </TabsTrigger>
            <TabsTrigger value="financeiro" className="gap-1.5 text-xs font-medium">
              <Wallet className="h-3.5 w-3.5" />
              Financeiro
            </TabsTrigger>
            <TabsTrigger value="equipamentos" className="gap-1.5 text-xs font-medium">
              <Wrench className="h-3.5 w-3.5" />
              Equipamentos
            </TabsTrigger>
          </TabsList>

          {/* Campo de Busca Rápida Unificado */}
          <div className="relative w-full lg:w-72">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Filtrar por nome, função ou item..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-9 pl-8 text-xs"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-2.5 top-2.5 text-xs text-muted-foreground hover:text-foreground"
              >
                &times;
              </button>
            )}
          </div>
        </div>

        {/* ------------------------------------------------------------- */}
        {/* ABA 1: ALERTAS CRÍTICOS UNIFICADOS */}
        {/* ------------------------------------------------------------- */}
        <TabsContent value="alertas" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Vencimentos mais urgentes */}
            <Card className="shadow-sm">
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <CalendarClock className="h-4 w-4 text-primary" /> Vencimentos de Funcionários
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Clique no funcionário para abrir a ficha e renovar datas diretamente.
                  </CardDescription>
                </div>
                <Link
                  to="/funcionarios"
                  className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
                >
                  Ver módulo <ExternalLink className="h-3 w-3" />
                </Link>
              </CardHeader>
              <CardContent>
                {alertasVencimento.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2 opacity-80" />
                    Todos os vencimentos de funcionários estão 100% em dia!
                  </div>
                ) : (
                  <ul className="divide-y text-sm">
                    {alertasVencimento
                      .filter(
                        (a) =>
                          !searchTerm ||
                          a.funcionarioNome.toLowerCase().includes(searchTerm.toLowerCase()),
                      )
                      .slice(0, 7)
                      .map((a, idx) => (
                        <li
                          key={idx}
                          role="button"
                          onClick={() => {
                            setSelectedFuncionario(a.funcionario);
                            setRenewField(a.campoKey);
                          }}
                          className="flex items-center justify-between py-2.5 px-2 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <StatusDot status={a.status} />
                            <div className="truncate">
                              <span className="font-semibold text-foreground hover:underline">
                                {a.funcionarioNome}
                              </span>
                              <span className="text-xs text-muted-foreground ml-1.5">
                                &bull; {a.label}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span
                              className={cn(
                                "text-xs font-semibold px-2 py-0.5 rounded",
                                a.status === "vermelho"
                                  ? "bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400"
                                  : "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400",
                              )}
                            >
                              {a.dias < 0 ? `Vencido há ${Math.abs(a.dias)}d` : `Vence em ${a.dias}d`}
                            </span>
                            <Button size="sm" variant="ghost" className="h-7 text-xs px-2">
                              Renovar
                            </Button>
                          </div>
                        </li>
                      ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* Estoques Críticos */}
            <Card className="shadow-sm">
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Package className="h-4 w-4 text-primary" /> Estoque Crítico (EPIs & Materiais)
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Itens que atingiram nível de reposição. Clique em Reabastecer.
                  </CardDescription>
                </div>
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs"
                  onClick={() => setActiveTab("estoques")}
                >
                  Ver todos ({estoqueCriticoTotal.length}) &rarr;
                </Button>
              </CardHeader>
              <CardContent>
                {estoqueCriticoTotal.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2 opacity-80" />
                    Nenhum item com estoque abaixo do mínimo!
                  </div>
                ) : (
                  <ul className="divide-y text-sm">
                    {estoqueCriticoTotal
                      .filter(
                        (i) =>
                          !searchTerm ||
                          i.nome.toLowerCase().includes(searchTerm.toLowerCase()),
                      )
                      .slice(0, 7)
                      .map((item) => (
                        <li
                          key={`${item.tipoItem}-${item.id}`}
                          className="flex items-center justify-between py-2.5 px-2 rounded-lg hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <StatusDot status="vermelho" />
                            <div className="truncate">
                              <span className="font-semibold">{item.nome}</span>
                              <span className="text-xs text-muted-foreground ml-1.5">
                                ({item.tipoItem === "epi" ? "EPI" : "Material"})
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <div className="text-right">
                              <span className="text-xs font-bold text-rose-600 dark:text-rose-400">
                                {Number(item.estoque_atual).toFixed(0)} / mín. {item.estoque_minimo}
                              </span>
                              <span className="text-[10px] text-muted-foreground block">
                                Falta {item.deficit}
                              </span>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs border-primary/40 text-primary hover:bg-primary hover:text-primary-foreground"
                              onClick={() => {
                                setSelectedStockItem(item);
                                setStockEntryQtd(item.deficit > 0 ? item.deficit : 1);
                              }}
                            >
                              + Repor
                            </Button>
                          </div>
                        </li>
                      ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* Tarefas Atrasadas & Pendentes */}
            <Card className="shadow-sm">
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <CheckSquare className="h-4 w-4 text-primary" /> Tarefas com Prazo Crítico
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Tarefas vencidas ou com vencimento próximo.
                  </CardDescription>
                </div>
                <Link
                  to="/tarefas"
                  className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
                >
                  Ver módulo <ExternalLink className="h-3 w-3" />
                </Link>
              </CardHeader>
              <CardContent>
                {tarefas.length === 0 ? (
                  <div className="py-6 text-center text-sm text-muted-foreground">
                    Nenhuma tarefa pendente!
                  </div>
                ) : (
                  <ul className="divide-y text-sm">
                    {tarefas.slice(0, 5).map((t: any) => {
                      const dias = t.data_vencimento
                        ? differenceInDays(safeParseISO(t.data_vencimento), new Date())
                        : null;
                      const atrasada = dias !== null && dias < 0;
                      return (
                        <li
                          key={t.id}
                          className="flex items-center justify-between py-2.5 px-2 hover:bg-muted/50 rounded-lg"
                        >
                          <div className="min-w-0 pr-2">
                            <span className="font-semibold block truncate">{t.titulo}</span>
                            <span className="text-xs text-muted-foreground">
                              {t.data_vencimento
                                ? `Vence: ${safeFormatDate(t.data_vencimento, "dd/MM/yyyy")}`
                                : "Sem prazo"}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {atrasada && (
                              <Badge variant="destructive" className="text-[10px] h-5">
                                Atrasada ({Math.abs(dias!)}d)
                              </Badge>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                              onClick={() => completeTask.mutate(t.id)}
                              disabled={completeTask.isPending}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Concluir
                            </Button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* Contas a Pagar Vencendo */}
            <Card className="shadow-sm">
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-primary" /> Finanças & Contas a Pagar
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Obrigações financeiras pendentes ou atrasadas.
                  </CardDescription>
                </div>
                <Link
                  to="/financeiro"
                  className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
                >
                  Ver módulo <ExternalLink className="h-3 w-3" />
                </Link>
              </CardHeader>
              <CardContent>
                {contasPagar.length === 0 ? (
                  <div className="py-6 text-center text-sm text-muted-foreground">
                    Nenhuma conta a pagar pendente.
                  </div>
                ) : (
                  <ul className="divide-y text-sm">
                    {contasPagar.slice(0, 5).map((c: any) => {
                      const dias = c.data_vencimento
                        ? differenceInDays(safeParseISO(c.data_vencimento), new Date())
                        : null;
                      const atrasada = dias !== null && dias < 0;
                      return (
                        <li
                          key={c.id}
                          className="flex items-center justify-between py-2.5 px-2 hover:bg-muted/50 rounded-lg"
                        >
                          <div className="min-w-0 pr-2">
                            <span className="font-semibold block truncate">{c.descricao}</span>
                            <span className="text-xs text-muted-foreground">
                              R$ {Number(c.valor ?? 0).toFixed(2)} &bull; Venc:{" "}
                              {safeFormatDate(c.data_vencimento, "dd/MM/yyyy")}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {atrasada && (
                              <Badge variant="destructive" className="text-[10px] h-5">
                                Vencida
                              </Badge>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => payAccount.mutate(c.id)}
                              disabled={payAccount.isPending}
                            >
                              Dar baixa
                            </Button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ------------------------------------------------------------- */}
        {/* ABA 2: VENCIMENTOS DE FUNCIONÁRIOS (RH & SST) */}
        {/* ------------------------------------------------------------- */}
        <TabsContent value="vencimentos" className="space-y-4">
          <Card className="shadow-sm">
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pb-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ClipboardCheck className="h-4 w-4 text-primary" /> Matriz de Conformidade RH &
                  SST
                </CardTitle>
                <CardDescription className="text-xs">
                  Clique na linha de qualquer funcionário para ver detalhes completos e atualizar
                  datas imediatamente.
                </CardDescription>
              </div>

              {/* Filtros da Matriz */}
              <div className="flex flex-wrap items-center gap-2">
                <Tabs
                  value={confTab}
                  onValueChange={(v) => {
                    setConfTab(v as any);
                    setPage(1);
                  }}
                >
                  <TabsList className="h-8">
                    <TabsTrigger value="pendentes" className="text-xs px-2.5">
                      Pendentes ({pendentes.length})
                    </TabsTrigger>
                    <TabsTrigger value="em_dia" className="text-xs px-2.5">
                      Em dia ({emDia.length})
                    </TabsTrigger>
                    <TabsTrigger value="todos" className="text-xs px-2.5">
                      Todos ({conformidade.length})
                    </TabsTrigger>
                  </TabsList>
                </Tabs>

                <Select
                  value={confFieldFilter}
                  onValueChange={(v) => {
                    setConfFieldFilter(v);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="h-8 w-36 text-xs">
                    <SelectValue placeholder="Tipo de exame/doc" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os tipos</SelectItem>
                    {VENC_FIELDS.map((f) => (
                      <SelectItem key={f.key} value={f.key}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {sortedConformidade.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  Nenhum funcionário encontrado para os filtros selecionados.
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto rounded-md border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 border-b">
                        <tr className="text-left text-xs font-semibold text-muted-foreground">
                          <th className="py-2.5 px-3">
                            <button
                              onClick={() => toggleSort("nome")}
                              className="inline-flex items-center gap-1 hover:text-foreground"
                            >
                              Funcionário <ArrowUpDown className="h-3 w-3" />
                            </button>
                          </th>
                          <th className="py-2.5 px-3">Função / Setor</th>
                          <th className="py-2.5 px-3">
                            <button
                              onClick={() => toggleSort("status")}
                              className="inline-flex items-center gap-1 hover:text-foreground"
                            >
                              Status Geral <ArrowUpDown className="h-3 w-3" />
                            </button>
                          </th>
                          {VENC_FIELDS.map((f) => (
                            <th key={f.key} className="py-2.5 px-3 whitespace-nowrap">
                              {f.label}
                            </th>
                          ))}
                          <th className="py-2.5 px-3 text-right">Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {pagedConformidade.map((c) => {
                          const f = c.funcionario as any;
                          return (
                            <tr
                              key={c.funcionario.id}
                              onClick={() => setSelectedFuncionario(f)}
                              className="hover:bg-muted/40 cursor-pointer transition-colors group"
                            >
                              <td className="py-2.5 px-3 font-semibold text-foreground group-hover:text-primary">
                                {c.funcionario.nome}
                              </td>
                              <td className="py-2.5 px-3 text-xs text-muted-foreground">
                                {f.funcao ?? "—"} {f.setor ? `(${f.setor})` : ""}
                              </td>
                              <td className="py-2.5 px-3">
                                <span
                                  className={cn(
                                    "inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded font-medium",
                                    c.pior === "verde" && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                                    c.pior === "amarelo" && "bg-amber-500/10 text-amber-600 dark:text-amber-400",
                                    c.pior === "vermelho" && "bg-rose-500/10 text-rose-600 dark:text-rose-400",
                                  )}
                                >
                                  <StatusDot status={c.pior} />
                                  {c.pior === "verde"
                                    ? "Em dia"
                                    : c.pior === "amarelo"
                                      ? "Vence em breve"
                                      : "Vencido"}
                                </span>
                              </td>
                              {c.items.map((i) => (
                                <td key={i.key} className="py-2.5 px-3 whitespace-nowrap text-xs">
                                  {i.status ? (
                                    <span
                                      className={cn(
                                        "inline-flex items-center gap-1.5",
                                        i.status === "verde" && "text-emerald-600 dark:text-emerald-400",
                                        i.status === "amarelo" && "text-amber-600 dark:text-amber-400 font-medium",
                                        i.status === "vermelho" && "text-rose-600 dark:text-rose-400 font-semibold",
                                      )}
                                    >
                                      <StatusDot status={i.status} />
                                      {safeFormatDate(i.data!, "dd/MM/yy")}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground/60">—</span>
                                  )}
                                </td>
                              ))}
                              <td className="py-2.5 px-3 text-right">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 text-xs"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedFuncionario(f);
                                  }}
                                >
                                  Gerenciar
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Paginação */}
                  <div className="flex flex-wrap items-center justify-between gap-2 mt-4 text-xs text-muted-foreground">
                    <span>
                      Exibindo {pagedConformidade.length} de {sortedConformidade.length} funcionários
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs px-2.5"
                        disabled={pageSafe <= 1}
                        onClick={() => setPage(pageSafe - 1)}
                      >
                        Anterior
                      </Button>
                      <span className="px-2">
                        {pageSafe} de {totalPages}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs px-2.5"
                        disabled={pageSafe >= totalPages}
                        onClick={() => setPage(pageSafe + 1)}
                      >
                        Próxima
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ------------------------------------------------------------- */}
        {/* ABA 3: ESTOQUES CRÍTICOS & REABASTECIMENTO */}
        {/* ------------------------------------------------------------- */}
        <TabsContent value="estoques" className="space-y-4">
          <Card className="shadow-sm">
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pb-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Package className="h-4 w-4 text-primary" /> Central de Reabastecimento de Estoque
                </CardTitle>
                <CardDescription className="text-xs">
                  Controle de itens abaixo da margem de segurança. Registre novas entradas com 1
                  clique.
                </CardDescription>
              </div>

              <div className="flex items-center gap-2">
                <Tabs
                  value={stockFilter}
                  onValueChange={(v) => setStockFilter(v as any)}
                >
                  <TabsList className="h-8">
                    <TabsTrigger value="todos" className="text-xs">
                      Todos ({estoqueCriticoTotal.length})
                    </TabsTrigger>
                    <TabsTrigger value="epis" className="text-xs">
                      EPIs ({epiAbaixoMin.length})
                    </TabsTrigger>
                    <TabsTrigger value="materiais" className="text-xs">
                      Materiais ({matAbaixoMin.length})
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </CardHeader>
            <CardContent>
              {(() => {
                const list =
                  stockFilter === "epis"
                    ? epiAbaixoMin
                    : stockFilter === "materiais"
                      ? matAbaixoMin
                      : estoqueCriticoTotal;

                const filtered = list.filter(
                  (item) =>
                    !searchTerm ||
                    item.nome.toLowerCase().includes(searchTerm.toLowerCase()),
                );

                if (filtered.length === 0) {
                  return (
                    <div className="py-12 text-center text-sm text-muted-foreground">
                      <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-2 opacity-80" />
                      Nenhum item com estoque crítico nesta categoria!
                    </div>
                  );
                }

                return (
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {filtered.map((item) => (
                      <div
                        key={`${item.tipoItem}-${item.id}`}
                        className="rounded-xl border bg-card p-4 shadow-sm flex flex-col justify-between hover:border-primary/50 transition-colors"
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-[10px] mb-1.5",
                                  item.tipoItem === "epi"
                                    ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300"
                                    : "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300",
                                )}
                              >
                                {item.tipoItem === "epi" ? "EPI / EPC" : "Material"}
                              </Badge>
                              <h4 className="font-bold text-sm tracking-tight text-foreground">
                                {item.nome}
                              </h4>
                              {item.ca && (
                                <span className="text-xs text-muted-foreground block">
                                  CA: {item.ca}
                                </span>
                              )}
                              {item.codigo && (
                                <span className="text-xs text-muted-foreground block">
                                  Cód: {item.codigo}
                                </span>
                              )}
                            </div>
                            <Badge
                              variant="destructive"
                              className="text-[10px] font-semibold shrink-0"
                            >
                              Faltam {item.deficit} {item.unidade ?? "un"}
                            </Badge>
                          </div>

                          {/* Barra de Nível de Estoque */}
                          <div className="mt-4 space-y-1.5">
                            <div className="flex justify-between text-xs font-medium">
                              <span className="text-rose-600 dark:text-rose-400">
                                Atual: {item.estoque_atual} {item.unidade ?? "un"}
                              </span>
                              <span className="text-muted-foreground">
                                Mín: {item.estoque_minimo} {item.unidade ?? "un"}
                              </span>
                            </div>
                            <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                              <div
                                className={cn(
                                  "h-full rounded-full transition-all",
                                  item.estoque_atual <= 0
                                    ? "bg-rose-600"
                                    : item.percentual < 50
                                      ? "bg-rose-500"
                                      : "bg-amber-500",
                                )}
                                style={{ width: `${Math.min(100, Math.max(5, item.percentual))}%` }}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Botões de Ação */}
                        <div className="mt-4 pt-3 border-t flex items-center justify-between gap-2">
                          <Link
                            to={item.tipoItem === "epi" ? "/epis" : "/materiais"}
                            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                          >
                            Ver no módulo <ExternalLink className="h-3 w-3" />
                          </Link>

                          <Button
                            size="sm"
                            className="h-8 gap-1 text-xs"
                            onClick={() => {
                              setSelectedStockItem(item);
                              setStockEntryQtd(item.deficit > 0 ? item.deficit : 1);
                            }}
                          >
                            <PlusCircle className="h-3.5 w-3.5" /> Reabastecer
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ------------------------------------------------------------- */}
        {/* ABA 4: TAREFAS & PRAZOS */}
        {/* ------------------------------------------------------------- */}
        <TabsContent value="tarefas" className="space-y-4">
          <Card className="shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckSquare className="h-4 w-4 text-primary" /> Fila de Tarefas Operacionais
                </CardTitle>
                <CardDescription className="text-xs">
                  Marque como concluída diretamente pelo Dashboard ou navegue para o Kanban.
                </CardDescription>
              </div>
              <Link to="/tarefas">
                <Button size="sm" variant="outline" className="text-xs gap-1">
                  Abrir Kanban <ExternalLink className="h-3 w-3" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {tarefas.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  Nenhuma tarefa pendente!
                </div>
              ) : (
                <div className="divide-y">
                  {tarefas
                    .filter(
                      (t: any) =>
                        !searchTerm ||
                        t.titulo.toLowerCase().includes(searchTerm.toLowerCase()),
                    )
                    .map((t: any) => {
                      const dias = t.data_vencimento
                        ? differenceInDays(safeParseISO(t.data_vencimento), new Date())
                        : null;
                      const atrasada = dias !== null && dias < 0;

                      return (
                        <div
                          key={t.id}
                          className="py-3 px-2 flex items-center justify-between gap-3 hover:bg-muted/40 rounded-lg transition-colors"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm">{t.titulo}</span>
                              <Badge
                                variant={
                                  t.prioridade === "urgente" || t.prioridade === "alta"
                                    ? "destructive"
                                    : "secondary"
                                }
                                className="text-[10px] h-4 uppercase"
                              >
                                {t.prioridade}
                              </Badge>
                            </div>
                            {t.descricao && (
                              <p className="text-xs text-muted-foreground truncate mt-0.5 max-w-xl">
                                {t.descricao}
                              </p>
                            )}
                            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                              {t.data_vencimento && (
                                <span
                                  className={cn(
                                    "flex items-center gap-1 font-medium",
                                    atrasada ? "text-rose-600 dark:text-rose-400" : "text-foreground",
                                  )}
                                >
                                  <Clock className="h-3 w-3" />
                                  {atrasada
                                    ? `Venceu há ${Math.abs(dias!)}d (${safeFormatDate(t.data_vencimento, "dd/MM/yyyy")})`
                                    : `Vence em ${dias}d (${safeFormatDate(t.data_vencimento, "dd/MM/yyyy")})`}
                                </span>
                              )}
                            </div>
                          </div>

                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs shrink-0 border-emerald-500/30 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                            onClick={() => completeTask.mutate(t.id)}
                            disabled={completeTask.isPending}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Concluir
                          </Button>
                        </div>
                      );
                    })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ------------------------------------------------------------- */}
        {/* ABA 5: FINANCEIRO */}
        {/* ------------------------------------------------------------- */}
        <TabsContent value="financeiro" className="space-y-4">
          <Card className="shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-primary" /> Contas & Compromissos a Pagar
                </CardTitle>
                <CardDescription className="text-xs">
                  Acompanhe e baixe títulos a pagar diretamente pelo painel.
                </CardDescription>
              </div>
              <Link to="/financeiro">
                <Button size="sm" variant="outline" className="text-xs gap-1">
                  Módulo Financeiro <ExternalLink className="h-3 w-3" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {contasPagar.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  Nenhuma conta a pagar em aberto!
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-xs text-muted-foreground text-left">
                        <th className="py-2.5 px-3">Descrição</th>
                        <th className="py-2.5 px-3">Valor</th>
                        <th className="py-2.5 px-3">Vencimento</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3 text-right">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {contasPagar
                        .filter(
                          (c: any) =>
                            !searchTerm ||
                            c.descricao.toLowerCase().includes(searchTerm.toLowerCase()),
                        )
                        .map((c: any) => {
                          const dias = c.data_vencimento
                            ? differenceInDays(safeParseISO(c.data_vencimento), new Date())
                            : null;
                          const atrasada = dias !== null && dias < 0;

                          return (
                            <tr key={c.id} className="hover:bg-muted/40">
                              <td className="py-2.5 px-3 font-semibold">{c.descricao}</td>
                              <td className="py-2.5 px-3 font-bold text-foreground">
                                R$ {Number(c.valor ?? 0).toFixed(2)}
                              </td>
                              <td className="py-2.5 px-3 text-xs">
                                {safeFormatDate(c.data_vencimento, "dd/MM/yyyy")}
                              </td>
                              <td className="py-2.5 px-3">
                                {atrasada ? (
                                  <Badge variant="destructive" className="text-[10px]">
                                    Atrasada ({Math.abs(dias!)}d)
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary" className="text-[10px]">
                                    A vencer ({dias}d)
                                  </Badge>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-right">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs"
                                  onClick={() => payAccount.mutate(c.id)}
                                  disabled={payAccount.isPending}
                                >
                                  Dar baixa
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ------------------------------------------------------------- */}
        {/* ABA 6: EQUIPAMENTOS & EMPRÉSTIMOS */}
        {/* ------------------------------------------------------------- */}
        <TabsContent value="equipamentos" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="shadow-sm">
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Wrench className="h-4 w-4 text-primary" /> Manutenções Preventivas de
                    Ferramentas
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Ferramentas com revisão agendada ou vencida.
                  </CardDescription>
                </div>
                <Link to="/ferramentas">
                  <Button size="sm" variant="outline" className="text-xs gap-1">
                    Ver ferramentas <ExternalLink className="h-3 w-3" />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent>
                {ferramentasAlertas.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    Nenhuma manutenção pendente nos próximos 30 dias.
                  </div>
                ) : (
                  <ul className="divide-y text-sm">
                    {ferramentasAlertas.map((f: any) => {
                      const dias = differenceInDays(
                        safeParseISO(f.proxima_manutencao),
                        new Date(),
                      );
                      const vencida = dias < 0;
                      return (
                        <li key={f.id} className="py-2.5 px-2 flex items-center justify-between">
                          <div>
                            <span className="font-semibold block">{f.nome}</span>
                            <span className="text-xs text-muted-foreground">
                              Cód: {f.codigo ?? "—"} &bull; Data prevista:{" "}
                              {safeFormatDate(f.proxima_manutencao, "dd/MM/yyyy")}
                            </span>
                          </div>
                          <Badge
                            variant={vencida ? "destructive" : "outline"}
                            className="text-[10px]"
                          >
                            {vencida ? `Atrasada há ${Math.abs(dias)}d` : `Em ${dias}d`}
                          </Badge>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-rose-500" /> Devoluções Atrasadas de
                    Empréstimo
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Ferramentas em posse de colaboradores com prazo expirado.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {emprestimosAtrasados.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    Nenhum empréstimo em atraso no momento.
                  </div>
                ) : (
                  <ul className="divide-y text-sm">
                    {emprestimosAtrasados.map((emp: any) => (
                      <li key={emp.id} className="py-2.5 px-2 flex items-center justify-between">
                        <div>
                          <span className="font-semibold block">{emp.ferramentas?.nome}</span>
                          <span className="text-xs text-muted-foreground">
                            Com: {emp.funcionarios?.nome ?? "Não identificado"} &bull; Previsto:{" "}
                            {safeFormatDate(emp.prevista_devolucao, "dd/MM/yyyy")}
                          </span>
                        </div>
                        <Badge variant="destructive" className="text-[10px]">
                          Devolução Atrasada
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* ============================================================= */}
      {/* MODAL 1: DETALHES E RENOVAÇÃO RÁPIDA DE FUNCIONÁRIO */}
      {/* ============================================================= */}
      <Dialog
        open={!!selectedFuncionario}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedFuncionario(null);
            setRenewDate("");
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          {selectedFuncionario && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <div className="h-11 w-11 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-base">
                    {(selectedFuncionario.nome ?? "F")
                      .split(" ")
                      .map((p: string) => p[0])
                      .slice(0, 2)
                      .join("")}
                  </div>
                  <div>
                    <DialogTitle className="text-lg">{selectedFuncionario.nome}</DialogTitle>
                    <DialogDescription className="text-xs text-muted-foreground">
                      {selectedFuncionario.funcao ?? "Sem função"} &bull;{" "}
                      {selectedFuncionario.setor ?? "Geral"}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-4 py-2">
                {/* Contatos & Obra */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 bg-muted/40 rounded-lg text-xs">
                  <div>
                    <span className="text-muted-foreground block">Telefone:</span>
                    <span className="font-medium text-foreground">
                      {selectedFuncionario.telefone ?? "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Email:</span>
                    <span className="font-medium text-foreground truncate block">
                      {selectedFuncionario.email ?? "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Obra:</span>
                    <span className="font-medium text-foreground">
                      {obras.find((o: any) => o.id === selectedFuncionario.obra_id)?.nome ??
                        "Geral / Sem obra"}
                    </span>
                  </div>
                </div>

                {/* Status dos 6 Vencimentos Principais */}
                <div>
                  <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">
                    Vencimentos Principais
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {VENC_FIELDS.map((f) => {
                      const dataStr = selectedFuncionario[f.key];
                      const dias = dataStr
                        ? differenceInDays(safeParseISO(dataStr), new Date())
                        : null;
                      const status: Status | null =
                        dias === null ? null : dias < 0 ? "vermelho" : dias <= 30 ? "amarelo" : "verde";

                      return (
                        <div
                          key={f.key}
                          className={cn(
                            "p-2.5 rounded-lg border text-xs flex flex-col justify-between",
                            status === "vermelho" && "border-rose-300 bg-rose-50/50 dark:bg-rose-950/20",
                            status === "amarelo" && "border-amber-300 bg-amber-50/50 dark:bg-amber-950/20",
                            status === "verde" && "border-emerald-200 bg-emerald-50/40 dark:bg-emerald-950/20",
                            status === null && "border-muted bg-muted/20",
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold">{f.label}</span>
                            {status && <StatusDot status={status} />}
                          </div>
                          <div className="mt-2">
                            <span className="text-xs font-bold block">
                              {dataStr ? safeFormatDate(dataStr, "dd/MM/yyyy") : "Não cadastrado"}
                            </span>
                            {dias !== null && (
                              <span
                                className={cn(
                                  "text-[10px] font-medium block",
                                  status === "vermelho" && "text-rose-600",
                                  status === "amarelo" && "text-amber-600",
                                  status === "verde" && "text-emerald-600",
                                )}
                              >
                                {dias < 0 ? `Vencido há ${Math.abs(dias)}d` : `Faltam ${dias}d`}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Treinamentos de NR adicionais */}
                {(() => {
                  const certs = treinamentosPorFuncionario.get(selectedFuncionario.id) ?? [];
                  if (certs.length === 0) return null;
                  return (
                    <div>
                      <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-1.5">
                        Treinamentos / NRs Cadastrados ({certs.length})
                      </h4>
                      <div className="max-h-28 overflow-y-auto space-y-1.5 pr-1">
                        {certs.map((c: any) => {
                          const dias = c.data_validade
                            ? differenceInDays(safeParseISO(c.data_validade), new Date())
                            : null;
                          const status = dias === null ? null : dias < 0 ? "vermelho" : dias <= 30 ? "amarelo" : "verde";

                          return (
                            <div
                              key={c.id}
                              className="p-2 rounded border bg-card text-xs flex items-center justify-between"
                            >
                              <span className="font-medium">{c.nome}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-muted-foreground">
                                  Validade: {safeFormatDate(c.data_validade, "dd/MM/yyyy")}
                                </span>
                                {status && <StatusDot status={status} />}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* Ação Rápida de Renovação / Atualização */}
                <div className="p-3.5 rounded-xl border border-primary/30 bg-primary/[0.03] space-y-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <span className="text-xs font-bold text-foreground">
                      Renovar ou Atualizar Vencimento Diretamente
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div className="space-y-1">
                      <Label className="text-xs">Documento / Exame</Label>
                      <Select value={renewField} onValueChange={setRenewField}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {VENC_FIELDS.map((f) => (
                            <SelectItem key={f.key} value={f.key}>
                              {f.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Nova Data de Vencimento</Label>
                      <Input
                        type="date"
                        value={renewDate}
                        onChange={(e) => setRenewDate(e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-1">
                    <Button
                      size="sm"
                      onClick={() => renewVencimento.mutate()}
                      disabled={!renewDate || renewVencimento.isPending}
                      className="h-8 text-xs gap-1"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {renewVencimento.isPending ? "Salvando..." : "Salvar Nova Data"}
                    </Button>
                  </div>
                </div>
              </div>

              <DialogFooter className="flex flex-row items-center justify-between sm:justify-between w-full">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigate({
                      to: "/funcionarios",
                      search: {
                        busca: selectedFuncionario.nome,
                        highlight: selectedFuncionario.id,
                      } as any,
                    });
                  }}
                  className="gap-1 text-xs"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Abrir Ficha Completa
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setSelectedFuncionario(null)}
                >
                  Fechar
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ============================================================= */}
      {/* MODAL 2: REABASTECIMENTO RÁPIDO DE ESTOQUE */}
      {/* ============================================================= */}
      <Dialog
        open={!!selectedStockItem}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedStockItem(null);
            setStockEntryObs("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          {selectedStockItem && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="text-[10px]">
                    {selectedStockItem.tipoItem === "epi" ? "EPI / EPC" : "Material"}
                  </Badge>
                </div>
                <DialogTitle className="text-base">
                  Reabastecer: {selectedStockItem.nome}
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Registre a chegada de mercadoria para atualizar o estoque imediatamente.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3 py-2 text-sm">
                <div className="grid grid-cols-2 gap-2 p-3 bg-muted/40 rounded-lg text-xs">
                  <div>
                    <span className="text-muted-foreground block">Estoque Atual:</span>
                    <span className="font-bold text-rose-600 dark:text-rose-400">
                      {selectedStockItem.estoque_atual} {selectedStockItem.unidade ?? "un"}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Estoque Mínimo:</span>
                    <span className="font-bold text-foreground">
                      {selectedStockItem.estoque_minimo} {selectedStockItem.unidade ?? "un"}
                    </span>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">
                    Quantidade a Adicionar ({selectedStockItem.unidade ?? "un"}) *
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    value={stockEntryQtd}
                    onChange={(e) => setStockEntryQtd(Number(e.target.value))}
                    className="h-9"
                    required
                  />
                  <span className="text-[11px] text-muted-foreground block">
                    Sugerido para atingir o mínimo:{" "}
                    {Math.max(
                      1,
                      selectedStockItem.estoque_minimo - selectedStockItem.estoque_atual,
                    )}
                  </span>
                </div>

                {selectedStockItem.tipoItem === "material" && (
                  <div className="space-y-1">
                    <Label className="text-xs">Obra de Destino</Label>
                    <Select value={stockEntryObra} onValueChange={setStockEntryObra}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Selecione a obra (opcional)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todas">Almoxarifado Geral</SelectItem>
                        {obras.map((o: any) => (
                          <SelectItem key={o.id} value={o.id}>
                            {o.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-1">
                  <Label className="text-xs">Observação / Nota Fiscal</Label>
                  <Input
                    placeholder="Ex: NF 1024 - Fornecedor X"
                    value={stockEntryObs}
                    onChange={(e) => setStockEntryObs(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              <DialogFooter className="flex flex-row items-center justify-between sm:justify-between w-full">
                <Link
                  to={selectedStockItem.tipoItem === "epi" ? "/epis" : "/materiais"}
                  className="text-xs text-muted-foreground hover:underline flex items-center gap-1"
                >
                  Ir para módulo completo <ExternalLink className="h-3 w-3" />
                </Link>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedStockItem(null)}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => restockItem.mutate()}
                    disabled={restockItem.isPending || stockEntryQtd <= 0}
                    className="gap-1 text-xs"
                  >
                    <PlusCircle className="h-3.5 w-3.5" />
                    {restockItem.isPending ? "Salvando..." : "Confirmar Entrada"}
                  </Button>
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
