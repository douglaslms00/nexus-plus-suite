import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { differenceInCalendarDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, FolderOpen, CheckSquare, AlertTriangle, MapPin } from "lucide-react";
import { safeParseISO } from "@/lib/utils";

const VENC_FUNC = ["vencimento_aso", "vencimento_treinamento", "vencimento_ferias", "vencimento_ficha_epi", "vencimento_experiencia", "vencimento_folga_campo"];

function dias(d?: string | null) {
  if (!d) return null;
  try { return differenceInCalendarDays(safeParseISO(d), new Date()); } catch { return null; }
}

export function PainelObras() {
  const [sel, setSel] = useState<string>("todas");
  const { data, isLoading } = useQuery({
    queryKey: ["painel-obras"],
    queryFn: async () => {
      const [o, f, d, t] = await Promise.all([
        supabase.from("obras").select("id, nome, endereco, status").order("nome"),
        supabase.from("funcionarios").select(`id, nome, funcao, ativo, obra_id, ${VENC_FUNC.join(", ")}`),
        supabase.from("documentos").select("id, obra_id, escopo"),
        supabase.from("tarefas").select("id, titulo, status, concluida, data_vencimento, obra_id" as any),
      ]);
      return {
        obras: (o.data ?? []) as any[],
        funcs: (f.data ?? []) as any[],
        docs: (d.data ?? []) as any[],
        tarefas: (t.data ?? []) as any[],
      };
    },
  });

  const stats = useMemo(() => {
    if (!data) return [];
    return data.obras.map((obra) => {
      const funcs = data.funcs.filter((x) => x.obra_id === obra.id && x.ativo !== false);
      let alertas = 0;
      for (const fn of funcs) for (const k of VENC_FUNC) { const n = dias(fn[k]); if (n !== null && n <= 30) alertas++; }
      const docs = data.docs.filter((x) => x.obra_id === obra.id);
      const ts = data.tarefas.filter((x) => x.obra_id === obra.id);
      const concl = ts.filter((x) => x.concluida || x.status === "concluida");
      const abertas = ts.filter((x) => !(x.concluida || x.status === "concluida"));
      const atrasadas = abertas.filter((x) => { const n = dias(x.data_vencimento); return n !== null && n < 0; });
      return { obra, funcs, alertas, docs, ts, concl, abertas, atrasadas };
    });
  }, [data]);

  const atual = stats.find((s) => s.obra.id === sel);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Painel por Obra</h1>
          <p className="text-sm text-muted-foreground">Funcionários, documentos e tarefas de cada obra.</p>
        </div>
        <Select value={sel} onValueChange={setSel}>
          <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as obras (comparativo)</SelectItem>
            {stats.map((s) => <SelectItem key={s.obra.id} value={s.obra.id}>{s.obra.nome}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}

      {!atual && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {stats.map((s) => (
            <Card key={s.obra.id} className="cursor-pointer p-4 transition hover:border-primary" onClick={() => setSel(s.obra.id)}>
              <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold">{s.obra.nome}</h3>
                  {s.obra.endereco && <p className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3 w-3" />{s.obra.endereco}</p>}
                </div>
                <Badge variant="secondary">{s.obra.status}</Badge>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <Mini icon={Users} label="Funcionários" value={s.funcs.length} />
                <Mini icon={FolderOpen} label="Documentos" value={s.docs.length} />
                <Mini icon={CheckSquare} label="Tarefas abertas" value={s.abertas.length} />
              </div>
              {(s.alertas > 0 || s.atrasadas.length > 0) && (
                <p className="mt-3 flex items-center gap-1 text-xs text-destructive">
                  <AlertTriangle className="h-3 w-3" />
                  {s.alertas} vencimento(s) de equipe · {s.atrasadas.length} tarefa(s) atrasada(s)
                </p>
              )}
            </Card>
          ))}
        </div>
      )}

      {atual && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Big icon={Users} label="Funcionários ativos" value={atual.funcs.length} sub={`${atual.alertas} vencimentos em até 30 dias`} />
            <Big icon={FolderOpen} label="Documentos" value={atual.docs.length} sub="arquivos da obra" />
            <Big icon={CheckSquare} label="Tarefas abertas" value={atual.abertas.length} sub={`${atual.concl.length} concluídas`} />
            <Big icon={AlertTriangle} label="Tarefas atrasadas" value={atual.atrasadas.length} sub="precisam de atenção" />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-4">
              <div className="mb-2 flex justify-between"><h3 className="font-semibold">Equipe</h3><Link to="/funcionarios" className="text-xs text-primary">Ver todos</Link></div>
              <ul className="max-h-80 divide-y overflow-auto text-sm">
                {atual.funcs.map((f) => {
                  const venc = VENC_FUNC.some((k) => { const n = dias(f[k]); return n !== null && n <= 30; });
                  return (
                    <li key={f.id} className="flex items-center justify-between py-2">
                      <span>{f.nome} <span className="text-xs text-muted-foreground">· {f.funcao ?? "-"}</span></span>
                      {venc ? <Badge variant="destructive">Vencimento</Badge> : <Badge variant="secondary">Em dia</Badge>}
                    </li>
                  );
                })}
                {atual.funcs.length === 0 && <li className="py-2 text-muted-foreground">Nenhum funcionário nesta obra.</li>}
              </ul>
            </Card>
            <Card className="p-4">
              <div className="mb-2 flex justify-between"><h3 className="font-semibold">Tarefas abertas</h3><Link to="/tarefas" className="text-xs text-primary">Ver todas</Link></div>
              <ul className="max-h-80 divide-y overflow-auto text-sm">
                {atual.abertas.map((t) => {
                  const n = dias(t.data_vencimento);
                  return (
                    <li key={t.id} className="flex items-center justify-between py-2">
                      <span>{t.titulo}</span>
                      {n !== null && <Badge variant={n < 0 ? "destructive" : "secondary"}>{n < 0 ? `${-n}d atrasada` : `${n}d`}</Badge>}
                    </li>
                  );
                })}
                {atual.abertas.length === 0 && <li className="py-2 text-muted-foreground">Nenhuma tarefa aberta. Ligue tarefas a esta obra no formulário de Tarefas.</li>}
              </ul>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function Mini({ icon: Icon, label, value }: { icon: any; label: string; value: number }) {
  return (
    <div className="rounded-md bg-muted/50 p-2">
      <Icon className="mx-auto h-4 w-4 text-primary" />
      <div className="text-lg font-bold">{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

function Big({ icon: Icon, label, value, sub }: { icon: any; label: string; value: number; sub: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground"><Icon className="h-4 w-4 text-primary" />{label}</div>
      <div className="mt-1 text-3xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </Card>
  );
}
