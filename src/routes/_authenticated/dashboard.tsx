import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Users, CheckSquare, HardHat, AlertTriangle, Package, CalendarClock, Wallet, ShieldCheck, MapPin,
  ClipboardCheck, FileDown, FileText, ArrowUpDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { parseISO, format } from "date-fns";
import { isAdmin, useUserRoles } from "@/lib/permissions";
import { useObraAtual } from "@/lib/obra-context";
import { exportCSV, exportPDF } from "@/lib/exports";
import {
  VENC_FIELDS, computeConformidade, type Status,
} from "@/lib/conformidade";

export const Route = createFileRoute("/_authenticated/dashboard")({ component: DashboardPage });

function StatusDot({ status }: { status: Status }) {
  return <span className={cn("inline-block h-2.5 w-2.5 rounded-full",
    status === "verde" && "bg-success", status === "amarelo" && "bg-warning", status === "vermelho" && "bg-destructive")} />;
}

const PAGE_SIZE = 10;
type SortKey = "nome" | "status";
const PIOR_RANK: Record<Status, number> = { vermelho: 0, amarelo: 1, verde: 2 };

function DashboardPage() {
  const { data: roles } = useUserRoles();
  const { obraId } = useObraAtual();
  const [confTab, setConfTab] = useState<"pendentes" | "em_dia" | "todos">("pendentes");
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("status");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const { data: obras = [] } = useQuery({
    queryKey: ["dash-obras"],
    queryFn: async () => (await supabase.from("obras").select("id, nome").order("nome")).data ?? [],
  });
  const obraAtualNome = obraId ? obras.find((o: any) => o.id === obraId)?.nome : null;

  const { data: funcionarios = [] } = useQuery({
    queryKey: ["dash-funcionarios", obraId],
    queryFn: async () => {
      let q = supabase.from("funcionarios").select("*").eq("ativo", true);
      if (obraId) q = q.eq("obra_id", obraId);
      return (await q).data ?? [];
    },
  });
  const { data: tarefas = [] } = useQuery({
    queryKey: ["dash-tarefas", obraId, funcionarios.map((f: any) => f.id).join(",")],
    queryFn: async () => {
      let q = supabase.from("tarefas").select("*").neq("status", "concluida");
      if (obraId) {
        const ids = funcionarios.map((f: any) => f.id);
        if (ids.length === 0) return [];
        q = q.in("funcionario_id", ids);
      }
      return (await q).data ?? [];
    },
  });
  const { data: epis = [] } = useQuery({ queryKey: ["dash-epis"], queryFn: async () => (await supabase.from("epis").select("*").eq("ativo", true)).data ?? [] });
  const { data: materiais = [] } = useQuery({ queryKey: ["dash-mat"], queryFn: async () => (await supabase.from("materiais").select("*").eq("ativo", true)).data ?? [] });
  const { data: contas = [] } = useQuery({
    queryKey: ["dash-contas", obraId],
    queryFn: async () => {
      let q = supabase.from("contas_financeiras").select("*").neq("status", "pago");
      if (obraId) q = q.eq("obra_id", obraId);
      return (await q).data ?? [];
    },
  });

  const conformidade = useMemo(() => computeConformidade(funcionarios), [funcionarios]);

  const alertasVencimento = useMemo(() => conformidade.flatMap((c) =>
    c.items.filter((i) => i.status && i.status !== "verde").map((i) => ({
      funcionario: c.funcionario.nome, label: i.label, dias: i.dias!, status: i.status!,
    }))
  ), [conformidade]);

  const epiAbaixoMin = epis.filter((e: any) => e.estoque_atual < e.estoque_minimo);
  const matAbaixoMin = materiais.filter((m: any) => Number(m.estoque_atual) < Number(m.estoque_minimo));
  const contasPagar = contas.filter((c: any) => c.tipo === "pagar");
  const alertasAtivos = alertasVencimento.length + epiAbaixoMin.length + matAbaixoMin.length;

  const pendentes = conformidade.filter((c) => c.pior !== "verde");
  const emDia = conformidade.filter((c) => c.pior === "verde");
  const base = confTab === "pendentes" ? pendentes : confTab === "em_dia" ? emDia : conformidade;

  const sorted = useMemo(() => {
    const arr = [...base];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "nome") cmp = (a.funcionario.nome ?? "").localeCompare(b.funcionario.nome ?? "");
      else cmp = PIOR_RANK[a.pior] - PIOR_RANK[b.pior];
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [base, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const paged = sorted.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("asc"); }
    setPage(1);
  };

  const exportRows = () => {
    const headers = ["Funcionário", "Status geral", ...VENC_FIELDS.map((f) => f.label)];
    const rows = sorted.map((c) => [
      c.funcionario.nome,
      c.pior === "verde" ? "Em dia" : c.pior === "amarelo" ? "Vence em breve" : "Vencido",
      ...c.items.map((i) => i.data ? `${format(parseISO(i.data), "dd/MM/yyyy")} (${i.status})` : "—"),
    ]);
    return { headers, rows };
  };
  const obraTag = obraAtualNome ? `-${obraAtualNome.replace(/\s+/g, "_")}` : "";
  const onCSV = () => { const { headers, rows } = exportRows(); exportCSV(`conformidade${obraTag}`, headers, rows); };
  const onPDF = () => { const { headers, rows } = exportRows(); exportPDF(`Conformidade${obraAtualNome ? ` - ${obraAtualNome}` : ""}`, headers, rows, `conformidade${obraTag}`); };

  const indicadores = [
    { label: "Alertas Ativos", valor: alertasAtivos, icon: AlertTriangle, status: alertasAtivos === 0 ? "verde" : alertasAtivos > 5 ? "vermelho" : "amarelo" },
    { label: "Funcionários Ativos", valor: funcionarios.length, icon: Users, status: "verde" as const },
    { label: "Tarefas Pendentes", valor: tarefas.length, icon: CheckSquare, status: tarefas.length > 10 ? "vermelho" : tarefas.length > 0 ? "amarelo" : "verde" },
    { label: "Contas a pagar", valor: contasPagar.length, icon: Wallet, status: contasPagar.length === 0 ? "verde" : "amarelo" },
    { label: "EPIs abaixo do mín.", valor: epiAbaixoMin.length, icon: HardHat, status: epiAbaixoMin.length === 0 ? "verde" : "vermelho" },
    { label: "Materiais abaixo do mín.", valor: matAbaixoMin.length, icon: Package, status: matAbaixoMin.length === 0 ? "verde" : "vermelho" },
  ] as const;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">Visão geral da operação em tempo real.</p>
        </div>
        <div className={cn("flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm",
          obraId ? "bg-primary/10 border-primary/30 text-primary" : "bg-muted text-muted-foreground")}>
          <MapPin className="h-4 w-4" />
          <span className="font-medium">{obraAtualNome ?? "Todas as obras"}</span>
        </div>
      </div>

      {isAdmin(roles) && (
        <Card className="p-3 flex items-center justify-between bg-primary/5 border-primary/30">
          <div className="flex items-center gap-2 text-sm"><ShieldCheck className="h-4 w-4 text-primary" /> Você é administrador.</div>
          <Link to="/acessos" className="text-sm underline">Gerenciar acessos</Link>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {indicadores.map((ind) => (
          <Card key={ind.label} className="relative overflow-hidden">
            <div className={cn("absolute top-0 left-0 h-1 w-full",
              ind.status === "verde" && "bg-success", ind.status === "amarelo" && "bg-warning", ind.status === "vermelho" && "bg-destructive")} />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">{ind.label}</CardTitle>
              <ind.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2"><span className="text-2xl font-bold">{ind.valor}</span><StatusDot status={ind.status} /></div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardCheck className="h-4 w-4" /> Conformidade de Funcionários
            <span className="text-xs font-normal text-muted-foreground">
              ({emDia.length} em dia · {pendentes.length} pendentes)
            </span>
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Tabs value={confTab} onValueChange={(v) => { setConfTab(v as any); setPage(1); }}>
              <TabsList>
                <TabsTrigger value="pendentes">Pendentes</TabsTrigger>
                <TabsTrigger value="em_dia">Em dia</TabsTrigger>
                <TabsTrigger value="todos">Todos</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button size="sm" variant="outline" onClick={onCSV}><FileDown className="h-4 w-4" /> CSV</Button>
            <Button size="sm" variant="outline" onClick={onPDF}><FileText className="h-4 w-4" /> PDF</Button>
          </div>
        </CardHeader>
        <CardContent>
          {sorted.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum funcionário nesta categoria.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground border-b">
                      <th className="py-2 pr-3">
                        <button onClick={() => toggleSort("nome")} className="inline-flex items-center gap-1 hover:text-foreground">
                          Funcionário <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </th>
                      <th className="py-2 pr-3">
                        <button onClick={() => toggleSort("status")} className="inline-flex items-center gap-1 hover:text-foreground">
                          Status <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </th>
                      {VENC_FIELDS.map((f) => <th key={f.key} className="py-2 pr-3 whitespace-nowrap">{f.label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((c) => (
                      <tr key={c.funcionario.id} className="border-b last:border-0">
                        <td className="py-2 pr-3 font-medium">{c.funcionario.nome}</td>
                        <td className="py-2 pr-3">
                          <span className={cn("inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded",
                            c.pior === "verde" && "bg-success/15 text-success",
                            c.pior === "amarelo" && "bg-warning/15 text-warning",
                            c.pior === "vermelho" && "bg-destructive/15 text-destructive")}>
                            <StatusDot status={c.pior} />
                            {c.pior === "verde" ? "Em dia" : c.pior === "amarelo" ? "Vence em breve" : "Vencido"}
                          </span>
                        </td>
                        {c.items.map((i) => (
                          <td key={i.key} className="py-2 pr-3 whitespace-nowrap text-xs">
                            {i.status ? (
                              <span className={cn("inline-flex items-center gap-1.5",
                                i.status === "verde" && "text-success",
                                i.status === "amarelo" && "text-warning",
                                i.status === "vermelho" && "text-destructive font-medium")}>
                                <StatusDot status={i.status} />
                                {format(parseISO(i.data!), "dd/MM/yy")}
                              </span>
                            ) : <span className="text-muted-foreground">—</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 mt-3 text-sm">
                <span className="text-muted-foreground">
                  Página {pageSafe} de {totalPages} · {sorted.length} registro{sorted.length === 1 ? "" : "s"}
                </span>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="outline" disabled={pageSafe <= 1} onClick={() => setPage(pageSafe - 1)}>Anterior</Button>
                  <Select value={String(pageSafe)} onValueChange={(v) => setPage(Number(v))}>
                    <SelectTrigger className="h-8 w-20"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                        <SelectItem key={p} value={String(p)}>{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="outline" disabled={pageSafe >= totalPages} onClick={() => setPage(pageSafe + 1)}>Próxima</Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><CalendarClock className="h-4 w-4" /> Vencimentos de Funcionários</CardTitle></CardHeader>
          <CardContent>
            {alertasVencimento.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma pendência.</p> : (
              <ul className="divide-y">
                {alertasVencimento.slice(0, 8).map((a, i) => (
                  <li key={i} className="flex items-center justify-between py-2 text-sm">
                    <div className="flex items-center gap-2"><StatusDot status={a.status} /><span className="font-medium">{a.funcionario}</span><span className="text-muted-foreground">— {a.label}</span></div>
                    <span className={cn("text-xs font-medium", a.status === "vermelho" && "text-destructive", a.status === "amarelo" && "text-warning")}>{a.dias < 0 ? `Vencido há ${Math.abs(a.dias)}d` : `Vence em ${a.dias}d`}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Package className="h-4 w-4" /> Estoque abaixo do mínimo</CardTitle></CardHeader>
          <CardContent>
            {epiAbaixoMin.length + matAbaixoMin.length === 0 ? <p className="text-sm text-muted-foreground">Todos os itens estão acima do mínimo.</p> : (
              <ul className="divide-y">
                {epiAbaixoMin.map((e: any) => (
                  <li key={e.id} className="flex items-center justify-between py-2 text-sm">
                    <div className="flex items-center gap-2"><StatusDot status="vermelho" /><span className="font-medium">{e.nome}</span><span className="text-xs text-muted-foreground">(EPI)</span></div>
                    <span className="text-xs text-destructive">{e.estoque_atual} / mín. {e.estoque_minimo}</span>
                  </li>
                ))}
                {matAbaixoMin.map((m: any) => (
                  <li key={m.id} className="flex items-center justify-between py-2 text-sm">
                    <div className="flex items-center gap-2"><StatusDot status="vermelho" /><span className="font-medium">{m.nome}</span><span className="text-xs text-muted-foreground">(Material)</span></div>
                    <span className="text-xs text-destructive">{Number(m.estoque_atual).toFixed(2)} / mín. {Number(m.estoque_minimo).toFixed(2)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
