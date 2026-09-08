import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useModulePerm } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
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
import { Plus, Trash2, MapPin, Pencil, AlertTriangle, Bell, CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { differenceInDays } from "date-fns";
import { cn, safeParseISO, safeFormatDate } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/obras")({ component: ObrasPage });

const VENC_OBRAS: ReadonlyArray<readonly [string, string, string]> = [
  ["vencimento_alvara", "Alvará", "data_alvara"],
  ["vencimento_pgr", "PGR", "data_pgr"],
  ["vencimento_pcmso", "PCMSO", "data_pcmso"],
  ["vencimento_ltcat", "LTCAT", "data_ltcat"],
  ["vencimento_outros", "Outros", "data_outros"],
] as const;

type ObraVencItem = { id: string; nome: string; data_emissao: string; data_vencimento: string };
function novoVenc(): ObraVencItem {
  return { id: crypto.randomUUID(), nome: "", data_emissao: "", data_vencimento: "" };
}

function vencColor(date?: string | null) {
  if (!date) return "text-muted-foreground";
  const days = differenceInDays(safeParseISO(date), new Date());
  if (days < 0) return "text-destructive font-semibold";
  if (days <= 30) return "text-amber-600 font-semibold";
  return "text-emerald-600";
}

function countVencimentosObra(obra: any): { proximos: number; vencidos: number } {
  let proximos = 0;
  let vencidos = 0;
  const hoje = new Date();
  for (const [keyVenc] of VENC_OBRAS) {
    const date = obra[keyVenc];
    if (!date) continue;
    const dias = differenceInDays(safeParseISO(date), hoje);
    if (dias < 0) vencidos++;
    else if (dias <= 30) proximos++;
  }
  return { proximos, vencidos };
}

function countOutrosVencimentos(itens: readonly ObraVencItem[]): { proximos: number; vencidos: number } {
  let proximos = 0;
  let vencidos = 0;
  const hoje = new Date();
  for (const t of itens) {
    if (!t.data_vencimento || !t.nome.trim()) continue;
    const dias = differenceInDays(safeParseISO(t.data_vencimento), hoje);
    if (dias < 0) vencidos++;
    else if (dias <= 30) proximos++;
  }
  return { proximos, vencidos };
}

function ObrasPage() {
  const qc = useQueryClient();
  const perm = useModulePerm("obras");
  const canCreate = perm.can_edit;
  const canDelete = perm.can_delete;

  const { data: obras = [] } = useQuery({
    queryKey: ["obras"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("obras")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: todosOutros = [] } = useQuery({
    queryKey: ["obra-vencimentos-all", obras.map((o: any) => o.id).sort().join(",")],
    enabled: obras.length > 0,
    staleTime: 1000 * 60 * 2,
    queryFn: async () => {
      const ids = obras.map((o: any) => o.id);
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from("obra_vencimentos")
        .select("obra_id, nome, data_vencimento, data_emissao")
        .in("obra_id", ids)
        .limit(2000);
      if (error) throw error;
      return data as Array<{ obra_id: string; nome: string; data_vencimento: string | null; data_emissao: string | null }>;
    },
  });

  const outrosPorObra = useMemo(() => {
    const m = new Map<string, Array<{ nome: string; data_vencimento: string | null }>>();
    for (const t of todosOutros as any[]) {
      const list = m.get(t.obra_id) ?? [];
      list.push(t);
      m.set(t.obra_id, list);
    }
    return m;
  }, [todosOutros]);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({ status: "ativa" });
  const [outrosVenc, setOutrosVenc] = useState<ObraVencItem[]>([novoVenc()]);

  const openNew = () => {
    setEditing(null);
    setForm({ status: "ativa" });
    setOutrosVenc([novoVenc()]);
    setOpen(true);
  };
  const openEdit = async (o: any) => {
    setEditing(o);
    setForm({ ...o });
    try {
      const { data } = await (supabase as any)
        .from("obra_vencimentos")
        .select("*")
        .eq("obra_id", o.id)
        .order("created_at");
      setOutrosVenc(
        data && data.length > 0
          ? data.map((t: any) => ({
              id: t.id,
              nome: t.nome ?? "",
              data_emissao: t.data_emissao ?? "",
              data_vencimento: t.data_vencimento ?? "",
            }))
          : [novoVenc()],
      );
    } catch {
      setOutrosVenc([novoVenc()]);
    }
    setOpen(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      const payload: any = {
        nome: form.nome,
        endereco: form.endereco || null,
        status: form.status,
        observacoes: form.observacoes || null,
        data_alvara: form.data_alvara || null,
        vencimento_alvara: form.vencimento_alvara || null,
        data_pgr: form.data_pgr || null,
        vencimento_pgr: form.vencimento_pgr || null,
        data_pcmso: form.data_pcmso || null,
        vencimento_pcmso: form.vencimento_pcmso || null,
        data_ltcat: form.data_ltcat || null,
        vencimento_ltcat: form.vencimento_ltcat || null,
        data_outros: form.data_outros || null,
        vencimento_outros: form.vencimento_outros || null,
        descricao_outros: form.descricao_outros || null,
      };
      // tenta salvar com colunas novas, com fallback se coluna ainda não existir no banco (evita quebrar antes da migration aplicar)
      const cols = Object.keys(payload);
      const tentar = async (isUpdate: boolean) => {
        let dados = { ...payload };
        for (let i = 0; i <= cols.length; i++) {
          const q = isUpdate
            ? (supabase as any).from("obras").update(dados).eq("id", editing.id)
            : (supabase as any).from("obras").insert(dados).select("id").single();
          const { data, error } = await q;
          if (!error) return data;
          const msg: string = error.message ?? "";
          const miss = [...msg.matchAll(/Could not find the '([^']+)' column/g)].map((m) => m[1]);
          if (miss.length === 0) throw error;
          miss.forEach((c) => delete dados[c]);
          if (Object.keys(dados).length === 0) throw error;
        }
      };
      let obraId = editing?.id;
      if (editing) {
        await tentar(true);
      } else {
        const res: any = await tentar(false);
        obraId = res?.id;
      }
      // salva vencimentos dinâmicos "Outros"
      if (obraId) {
        const validos = outrosVenc.filter((t) => t.nome.trim());
        await (supabase as any).from("obra_vencimentos").delete().eq("obra_id", obraId);
        if (validos.length > 0) {
          const rows = validos.map((t) => ({
            obra_id: obraId,
            nome: t.nome.trim(),
            data_emissao: t.data_emissao || null,
            data_vencimento: t.data_vencimento || null,
          }));
          const { error } = await (supabase as any).from("obra_vencimentos").insert(rows);
          if (error) console.warn("Outros vencimentos não salvos:", error.message);
        }
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Obra atualizada" : "Obra criada");
      qc.invalidateQueries({ queryKey: ["obras"] });
      qc.invalidateQueries({ queryKey: ["obra-vencimentos-all"] });
      setOpen(false);
      setForm({ status: "ativa" });
      setEditing(null);
      setOutrosVenc([novoVenc()]);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("obras").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Removida");
      qc.invalidateQueries({ queryKey: ["obras"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Obras</h1>
          <p className="text-muted-foreground">Centros de custo, localizações e controle de vencimentos (Alvará, PGR, PCMSO, LTCAT e Outros).</p>
        </div>
        {canCreate && (
          <Dialog
            open={open}
            onOpenChange={(v) => {
              setOpen(v);
              if (!v) setEditing(null);
            }}
          >
            <DialogTrigger asChild>
              <Button onClick={openNew}>
                <Plus className="h-4 w-4" /> Nova obra
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editing ? "Editar obra" : "Nova obra"}</DialogTitle>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  save.mutate();
                }}
                className="space-y-4"
              >
                <div className="space-y-1">
                  <Label>Nome *</Label>
                  <Input
                    required
                    value={form.nome ?? ""}
                    onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Endereço</Label>
                  <Input
                    value={form.endereco ?? ""}
                    onChange={(e) => setForm({ ...form, endereco: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Status</Label>
                  <Select
                    value={form.status}
                    onValueChange={(v) => setForm({ ...form, status: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ativa">Ativa</SelectItem>
                      <SelectItem value="pausada">Pausada</SelectItem>
                      <SelectItem value="concluida">Concluída</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Observações</Label>
                  <Textarea
                    value={form.observacoes ?? ""}
                    onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
                  />
                </div>

                {/* Vencimentos fixos */}
                <div className="pt-3 border-t space-y-3">
                  <p className="text-sm font-semibold flex items-center gap-2"><CalendarClock className="h-4 w-4" /> Vencimentos da obra</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {(
                      [
                        ["Alvará", "data_alvara", "vencimento_alvara"],
                        ["PGR (Programa de Gerenciamento de Riscos)", "data_pgr", "vencimento_pgr"],
                        ["PCMSO", "data_pcmso", "vencimento_pcmso"],
                        ["LTCAT", "data_ltcat", "vencimento_ltcat"],
                      ] as const
                    ).map(([rotulo, keyData, keyVenc]) => (
                      <div key={rotulo} className="rounded-lg border p-3 space-y-2 bg-muted/10">
                        <span className="text-xs font-medium text-muted-foreground">{rotulo}</span>
                        <div className="space-y-1">
                          <Label className="text-xs">Data de emissão</Label>
                          <Input
                            type="date"
                            value={form[keyData] ?? ""}
                            onChange={(e) => setForm({ ...form, [keyData]: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Vencimento</Label>
                          <Input
                            type="date"
                            value={form[keyVenc] ?? ""}
                            onChange={(e) => setForm({ ...form, [keyVenc]: e.target.value })}
                          />
                          {form[keyVenc] && (
                            <span className={cn("text-xs", vencColor(form[keyVenc]))}>
                              {safeFormatDate(form[keyVenc], "dd/MM/yyyy")}
                              {" · "}
                              {differenceInDays(safeParseISO(form[keyVenc]), new Date()) < 0
                                ? "VENCIDO"
                                : differenceInDays(safeParseISO(form[keyVenc]), new Date()) <= 30
                                  ? "vence em breve"
                                  : "em dia"}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Outros - campo fixo + descrição */}
                  <div className="rounded-lg border p-3 space-y-2 bg-muted/10">
                    <span className="text-xs font-medium text-muted-foreground">Outros (campo fixo)</span>
                    <div className="space-y-1">
                      <Label className="text-xs">Descrição</Label>
                      <Input
                        placeholder="Ex: Licença Ambiental, AVCB..."
                        value={form.descricao_outros ?? ""}
                        onChange={(e) => setForm({ ...form, descricao_outros: e.target.value })}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Data de emissão</Label>
                        <Input type="date" value={form.data_outros ?? ""} onChange={(e) => setForm({ ...form, data_outros: e.target.value })} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Vencimento</Label>
                        <Input type="date" value={form.vencimento_outros ?? ""} onChange={(e) => setForm({ ...form, vencimento_outros: e.target.value })} />
                      </div>
                    </div>
                    {form.vencimento_outros && (
                      <span className={cn("text-xs", vencColor(form.vencimento_outros))}>
                        {safeFormatDate(form.vencimento_outros, "dd/MM/yyyy")}
                        {" · "}
                        {differenceInDays(safeParseISO(form.vencimento_outros), new Date()) < 0
                          ? "VENCIDO"
                          : differenceInDays(safeParseISO(form.vencimento_outros), new Date()) <= 30
                            ? "vence em breve"
                            : "em dia"}
                      </span>
                    )}
                  </div>

                  {/* Outros dinâmicos */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold">Outros vencimentos (adicionais)</p>
                      <Button type="button" size="sm" variant="outline" onClick={() => setOutrosVenc((prev) => [...prev, novoVenc()])}>
                        <Plus className="h-3 w-3 mr-1" /> Adicionar
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">Use para cadastrar múltiplos documentos além dos fixos acima.</p>
                    <div className="space-y-2">
                      {outrosVenc.map((t, i) => (
                        <div key={t.id} className="rounded-lg border p-3 space-y-2 bg-muted/10 relative">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-muted-foreground">Documento {i + 1}</span>
                            {outrosVenc.length > 1 && (
                              <Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={() => setOutrosVenc((prev) => prev.filter((_, idx) => idx !== i))}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Nome do documento</Label>
                            <Input placeholder="Ex: AVCB, Licença Ambiental, Habite-se..." value={t.nome} onChange={(e) => setOutrosVenc((prev) => prev.map((x, idx) => (idx === i ? { ...x, nome: e.target.value } : x)))} />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <Label className="text-xs">Emissão</Label>
                              <Input type="date" value={t.data_emissao} onChange={(e) => setOutrosVenc((prev) => prev.map((x, idx) => (idx === i ? { ...x, data_emissao: e.target.value } : x)))} />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Vencimento</Label>
                              <Input type="date" value={t.data_vencimento} onChange={(e) => setOutrosVenc((prev) => prev.map((x, idx) => (idx === i ? { ...x, data_vencimento: e.target.value } : x)))} />
                              {t.data_vencimento && (
                                <span className={cn("text-xs", vencColor(t.data_vencimento))}>
                                  {differenceInDays(safeParseISO(t.data_vencimento), new Date()) < 0 ? "VENCIDO" : differenceInDays(safeParseISO(t.data_vencimento), new Date()) <= 30 ? "vence em breve" : "em dia"}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <DialogFooter>
                  <Button type="submit" disabled={save.isPending}>
                    {save.isPending ? "Salvando..." : editing ? "Salvar" : "Criar"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {obras.map((o: any) => {
          const base = countVencimentosObra(o);
          const outros = outrosPorObra.get(o.id) ?? [];
          const dyn = countOutrosVencimentos(outros as any);
          const proximos = base.proximos + dyn.proximos;
          const vencidos = base.vencidos + dyn.vencidos;
          return (
            <Card key={o.id} className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary shrink-0" />
                    <h3 className="font-medium truncate">{o.nome}</h3>
                  </div>
                  {o.endereco && <p className="text-sm text-muted-foreground mt-1 truncate">{o.endereco}</p>}
                  {o.observacoes && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{o.observacoes}</p>}
                  <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded bg-muted mt-2 inline-block">{o.status}</span>
                  {(proximos > 0 || vencidos > 0) && (
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      {proximos > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-400">
                          <Bell className="h-3.5 w-3.5" /> {proximos} a vencer
                        </span>
                      )}
                      {vencidos > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-red-300 bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:border-red-500/40 dark:bg-red-500/15 dark:text-red-400">
                          <AlertTriangle className="h-3.5 w-3.5" /> {vencidos} vencido(s)
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  {canCreate && (
                    <Button size="icon" variant="ghost" onClick={() => openEdit(o)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                  {canDelete && (
                    <Button size="icon" variant="ghost" onClick={() => confirm("Excluir?") && remove.mutate(o.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Lista de vencimentos */}
              <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t">
                {VENC_OBRAS.filter(([k]) => o[k] || (k === "vencimento_outros" && o.descricao_outros)).map(([k, label]) => (
                  <div key={k} className="flex flex-col">
                    <span className="text-muted-foreground text-[11px]">{label}{k === "vencimento_outros" && o.descricao_outros ? ` - ${o.descricao_outros}` : ""}</span>
                    <span className={cn("whitespace-nowrap", vencColor(o[k]))}>{o[k] ? safeFormatDate(o[k], "dd/MM/yyyy") : "—"}</span>
                  </div>
                ))}
                {outros.length > 0 && outros.map((t: any, idx: number) => (
                  <div key={idx} className="flex flex-col">
                    <span className="text-muted-foreground text-[11px]">{t.nome || `Outros ${idx+1}`}</span>
                    <span className={cn("whitespace-nowrap", vencColor(t.data_vencimento))}>{t.data_vencimento ? safeFormatDate(t.data_vencimento, "dd/MM/yyyy") : "—"}</span>
                  </div>
                ))}
                {VENC_OBRAS.every(([k]) => !o[k]) && outros.length === 0 && (
                  <span className="col-span-2 text-muted-foreground text-xs">Nenhum vencimento cadastrado.</span>
                )}
              </div>
            </Card>
          );
        })}
        {obras.length === 0 && (
          <Card className="p-8 text-center text-muted-foreground md:col-span-2 lg:col-span-3">Nenhuma obra cadastrada.</Card>
        )}
      </div>
    </div>
  );
}
