import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, CheckSquare, HardHat, AlertTriangle, Package, CalendarClock, Wallet, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { differenceInDays, parseISO } from "date-fns";
import { isAdmin, useUserRoles } from "@/lib/permissions";

export const Route = createFileRoute("/_authenticated/dashboard")({ component: DashboardPage });

const FIELDS = [
  { key: "vencimento_aso", label: "ASO" },
  { key: "vencimento_treinamento", label: "Treinamento" },
  { key: "vencimento_folga_campo", label: "Folga de Campo" },
  { key: "vencimento_ferias", label: "Férias" },
  { key: "vencimento_ficha_epi", label: "Ficha EPI" },
] as const;

function statusFromDays(days: number): "verde" | "amarelo" | "vermelho" {
  if (days < 0) return "vermelho";
  if (days <= 30) return "amarelo";
  return "verde";
}

function StatusDot({ status }: { status: "verde" | "amarelo" | "vermelho" }) {
  return <span className={cn("inline-block h-2.5 w-2.5 rounded-full",
    status === "verde" && "bg-success", status === "amarelo" && "bg-warning", status === "vermelho" && "bg-destructive")} />;
}

function DashboardPage() {
  const { data: roles } = useUserRoles();

  const { data: funcionarios = [] } = useQuery({ queryKey: ["dash-funcionarios"], queryFn: async () => (await supabase.from("funcionarios").select("*").eq("ativo", true)).data ?? [] });
  const { data: tarefas = [] } = useQuery({ queryKey: ["dash-tarefas"], queryFn: async () => (await supabase.from("tarefas").select("*").neq("status", "concluida")).data ?? [] });
  const { data: epis = [] } = useQuery({ queryKey: ["dash-epis"], queryFn: async () => (await supabase.from("epis").select("*").eq("ativo", true)).data ?? [] });
  const { data: materiais = [] } = useQuery({ queryKey: ["dash-mat"], queryFn: async () => (await supabase.from("materiais").select("*").eq("ativo", true)).data ?? [] });
  const { data: contas = [] } = useQuery({ queryKey: ["dash-contas"], queryFn: async () => (await supabase.from("contas_financeiras").select("*").neq("status", "pago")).data ?? [] });


  const alertasVencimento = funcionarios.flatMap((f: any) =>
    FIELDS.flatMap(({ key, label }) => {
      const v = f[key]; if (!v) return [];
      const days = differenceInDays(parseISO(v), new Date());
      const status = statusFromDays(days);
      if (status === "verde") return [];
      return [{ funcionario: f.nome, label, dias: days, status }];
    })
  );
  const epiAbaixoMin = epis.filter((e: any) => e.estoque_atual < e.estoque_minimo);
  const matAbaixoMin = materiais.filter((m: any) => Number(m.estoque_atual) < Number(m.estoque_minimo));
  const contasPagar = contas.filter((c: any) => c.tipo === "pagar");
  const alertasAtivos = alertasVencimento.length + epiAbaixoMin.length + matAbaixoMin.length;

  const indicadores = [
    { label: "Alertas Ativos", valor: alertasAtivos, icon: AlertTriangle, status: alertasAtivos === 0 ? "verde" : alertasAtivos > 5 ? "vermelho" : "amarelo" },
    { label: "Funcionários Ativos", valor: funcionarios.length, icon: Users, status: "verde" as const },
    { label: "Tarefas Pendentes", valor: tarefas.length, icon: CheckSquare, status: tarefas.length > 10 ? "vermelho" : tarefas.length > 0 ? "amarelo" : "verde" },
    { label: "Contas a pagar", valor: contasPagar.length, icon: Wallet, status: contasPagar.length === 0 ? "verde" : "amarelo" },
    { label: "EPIs abaixo do mín.", valor: epiAbaixoMin.length, icon: HardHat, status: epiAbaixoMin.length === 0 ? "verde" : "vermelho" },
    { label: "Materiais abaixo do mín.", valor: matAbaixoMin.length, icon: Package, status: matAbaixoMin.length === 0 ? "verde" : "vermelho" },
  ] as const;

  const semAdmin = (adminCount ?? 0) === 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Visão geral da operação em tempo real.</p>
      </div>

      {semAdmin && !isAdmin(roles) && (
        <Card className="p-4 border-warning bg-warning/5 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-warning" />
            <div>
              <p className="font-medium">Nenhum administrador configurado</p>
              <p className="text-sm text-muted-foreground">Como o sistema ainda não tem um admin, você pode se promover agora para gerenciar acessos.</p>
            </div>
          </div>
          <Button onClick={() => promote.mutate()} disabled={promote.isPending}>Tornar-me Admin</Button>
        </Card>
      )}
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
