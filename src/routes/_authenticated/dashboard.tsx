import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, CheckSquare, HardHat, AlertTriangle, Package, CalendarClock, Wallet, ShieldCheck, MapPin, ClipboardCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { differenceInDays, parseISO, format } from "date-fns";
import { isAdmin, useUserRoles } from "@/lib/permissions";
import { useObraAtual } from "@/lib/obra-context";

export const Route = createFileRoute("/_authenticated/dashboard")({ component: DashboardPage });

const FIELDS = [
  { key: "vencimento_aso", label: "ASO" },
  { key: "vencimento_treinamento", label: "Treinamento" },
  { key: "vencimento_folga_campo", label: "Folga de Campo" },
  { key: "vencimento_ferias", label: "Férias" },
  { key: "vencimento_ficha_epi", label: "Ficha EPI" },
  { key: "vencimento_experiencia", label: "Experiência" },
] as const;

type Status = "verde" | "amarelo" | "vermelho";

function statusFromDays(days: number): Status {
  if (days < 0) return "vermelho";
  if (days <= 30) return "amarelo";
  return "verde";
}

function StatusDot({ status }: { status: Status }) {
  return <span className={cn("inline-block h-2.5 w-2.5 rounded-full",
    status === "verde" && "bg-success", status === "amarelo" && "bg-warning", status === "vermelho" && "bg-destructive")} />;
}

function DashboardPage() {
  const { data: roles } = useUserRoles();
  const { obraId } = useObraAtual();
  const [confTab, setConfTab] = useState<"pendentes" | "em_dia" | "todos">("pendentes");

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

  const conformidade = useMemo(() => funcionarios.map((f: any) => {
    const items = FIELDS.map(({ key, label }) => {
      const v = f[key as keyof typeof f];
      if (!v) return { key, label, status: null as Status | null, dias: null as number | null, data: null as string | null };
      const days = differenceInDays(parseISO(v as string), new Date());
      return { key, label, status: statusFromDays(days), dias: days, data: v as string };
    });
    const pior: Status = items.some((i) => i.status === "vermelho") ? "vermelho"
      : items.some((i) => i.status === "amarelo") ? "amarelo" : "verde";
    return { funcionario: f, items, pior };
  }), [funcionarios]);

  const alertasVencimento = conformidade.flatMap((c) =>
    c.items.filter((i) => i.status && i.status !== "verde").map((i) => ({
      funcionario: c.funcionario.nome, label: i.label, dias: i.dias!, status: i.status!,
    }))
  );

  const epiAbaixoMin = epis.filter((e: any) => e.estoque_atual < e.estoque_minimo);
  const matAbaixoMin = materiais.filter((m: any) => Number(m.estoque_atual) < Number(m.estoque_minimo));
  const contasPagar = contas.filter((c: any) => c.tipo === "pagar");
  const alertasAtivos = alertasVencimento.length + epiAbaixoMin.length + matAbaixoMin.length;

  // Validação automática: contador bate com soma e cores correspondem aos dias.
  useEffect(() => {
    const soma = alertasVencimento.length + epiAbaixoMin.length + matAbaixoMin.length;
    if (soma !== alertasAtivos) console.error("[Validação] Alertas Ativos divergem da soma", { soma, alertasAtivos });
    for (const a of alertasVencimento) {
      const esperado = statusFromDays(a.dias);
      if (esperado !== a.status) console.error("[Validação] Cor incorreta", a);
    }
  }, [alertasAtivos, alertasVencimento, epiAbaixoMin.length, matAbaixoMin.length]);

  const pendentes = conformidade.filter((c) => c.pior !== "verde");
  const emDia = conformidade.filter((c) => c.pior === "verde");
  const confLista = confTab === "pendentes" ? pendentes : confTab === "em_dia" ? emDia : conformidade;

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
        <div className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm",
          obraId ? "bg-primary/10 border-primary/30 text-primary" : "bg-muted text-muted-foreground"
        )}>
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
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardCheck className="h-4 w-4" /> Conformidade de Funcionários
            <span className="text-xs font-normal text-muted-foreground">
              ({emDia.length} em dia · {pendentes.length} pendentes)
            </span>
          </CardTitle>
          <Tabs value={confTab} onValueChange={(v) => setConfTab(v as any)}>
            <TabsList>
              <TabsTrigger value="pendentes">Pendentes</TabsTrigger>
              <TabsTrigger value="em_dia">Em dia</TabsTrigger>
              <TabsTrigger value="todos">Todos</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent>
          {confLista.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum funcionário nesta categoria.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b">
                    <th className="py-2 pr-3">Funcionário</th>
                    <th className="py-2 pr-3">Status</th>
                    {FIELDS.map((f) => <th key={f.key} className="py-2 pr-3 whitespace-nowrap">{f.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {confLista.map((c) => (
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
