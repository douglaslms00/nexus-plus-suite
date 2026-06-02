import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, CheckSquare, HardHat, AlertTriangle, Package, CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";
import { differenceInDays, parseISO } from "date-fns";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

type VencimentoField = "vencimento_aso" | "vencimento_treinamento" | "vencimento_folga_campo" | "vencimento_ferias" | "vencimento_ficha_epi";
const FIELDS: { key: VencimentoField; label: string }[] = [
  { key: "vencimento_aso", label: "ASO" },
  { key: "vencimento_treinamento", label: "Treinamento" },
  { key: "vencimento_folga_campo", label: "Folga de Campo" },
  { key: "vencimento_ferias", label: "Férias" },
  { key: "vencimento_ficha_epi", label: "Ficha EPI" },
];

function statusFromDays(days: number): "verde" | "amarelo" | "vermelho" {
  if (days < 0) return "vermelho";
  if (days <= 30) return "amarelo";
  return "verde";
}

function StatusDot({ status }: { status: "verde" | "amarelo" | "vermelho" }) {
  return (
    <span
      className={cn(
        "inline-block h-2.5 w-2.5 rounded-full",
        status === "verde" && "bg-success",
        status === "amarelo" && "bg-warning",
        status === "vermelho" && "bg-destructive"
      )}
    />
  );
}

function DashboardPage() {
  const { data: funcionarios = [] } = useQuery({
    queryKey: ["dash-funcionarios"],
    queryFn: async () => {
      const { data, error } = await supabase.from("funcionarios").select("*").eq("ativo", true);
      if (error) throw error;
      return data;
    },
  });

  const { data: tarefas = [] } = useQuery({
    queryKey: ["dash-tarefas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tarefas").select("*").neq("status", "concluida");
      if (error) throw error;
      return data;
    },
  });

  const { data: epis = [] } = useQuery({
    queryKey: ["dash-epis"],
    queryFn: async () => {
      const { data, error } = await supabase.from("epis").select("*").eq("ativo", true);
      if (error) throw error;
      return data;
    },
  });

  const alertasVencimento = funcionarios.flatMap((f: any) =>
    FIELDS.flatMap(({ key, label }) => {
      const v = f[key];
      if (!v) return [];
      const days = differenceInDays(parseISO(v), new Date());
      const status = statusFromDays(days);
      if (status === "verde") return [];
      return [{ funcionario: f.nome, label, dias: days, status, data: v }];
    })
  );

  const epiAbaixoMin = epis.filter((e: any) => e.estoque_atual < e.estoque_minimo);
  const alertasAtivos = alertasVencimento.length + epiAbaixoMin.length;

  const indicadores: { label: string; valor: number; icon: typeof AlertTriangle; status: "verde" | "amarelo" | "vermelho" }[] = [
    { label: "Alertas Ativos", valor: alertasAtivos, icon: AlertTriangle, status: alertasAtivos === 0 ? "verde" : alertasAtivos > 5 ? "vermelho" : "amarelo" },
    { label: "Funcionários Ativos", valor: funcionarios.length, icon: Users, status: "verde" },
    { label: "Tarefas Pendentes", valor: tarefas.length, icon: CheckSquare, status: tarefas.length > 10 ? "vermelho" : tarefas.length > 0 ? "amarelo" : "verde" },
    { label: "EPIs abaixo do mínimo", valor: epiAbaixoMin.length, icon: Package, status: epiAbaixoMin.length === 0 ? "verde" : "vermelho" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Visão geral da operação em tempo real.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {indicadores.map((ind) => (
          <Card key={ind.label} className="relative overflow-hidden">
            <div className={cn(
              "absolute top-0 left-0 h-1 w-full",
              ind.status === "verde" && "bg-success",
              ind.status === "amarelo" && "bg-warning",
              ind.status === "vermelho" && "bg-destructive",
            )} />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{ind.label}</CardTitle>
              <ind.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <span className="text-3xl font-bold">{ind.valor}</span>
                <StatusDot status={ind.status} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="h-4 w-4" /> Vencimentos de Funcionários
            </CardTitle>
          </CardHeader>
          <CardContent>
            {alertasVencimento.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma pendência registrada.</p>
            ) : (
              <ul className="divide-y">
                {alertasVencimento.slice(0, 8).map((a, i) => (
                  <li key={i} className="flex items-center justify-between py-2 text-sm">
                    <div className="flex items-center gap-2">
                      <StatusDot status={a.status} />
                      <span className="font-medium">{a.funcionario}</span>
                      <span className="text-muted-foreground">— {a.label}</span>
                    </div>
                    <span className={cn(
                      "text-xs font-medium",
                      a.status === "vermelho" && "text-destructive",
                      a.status === "amarelo" && "text-warning"
                    )}>
                      {a.dias < 0 ? `Vencido há ${Math.abs(a.dias)}d` : `Vence em ${a.dias}d`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <HardHat className="h-4 w-4" /> Estoque de EPI / EPC abaixo do mínimo
            </CardTitle>
          </CardHeader>
          <CardContent>
            {epiAbaixoMin.length === 0 ? (
              <p className="text-sm text-muted-foreground">Todos os EPIs estão acima do estoque mínimo.</p>
            ) : (
              <ul className="divide-y">
                {epiAbaixoMin.map((e: any) => (
                  <li key={e.id} className="flex items-center justify-between py-2 text-sm">
                    <div className="flex items-center gap-2">
                      <StatusDot status="vermelho" />
                      <span className="font-medium">{e.nome}</span>
                      <span className="text-xs text-muted-foreground">({e.tipo})</span>
                    </div>
                    <span className="text-xs text-destructive font-medium">
                      {e.estoque_atual} / mín. {e.estoque_minimo}
                    </span>
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
