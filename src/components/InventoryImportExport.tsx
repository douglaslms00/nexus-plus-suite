import { useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  FileDown,
  FileText,
  FileUp,
  Table as TableIcon,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { exportCSV, exportPDF } from "@/lib/exports";
import {
  INVENTORY_SCHEMAS,
  downloadTemplate,
  mapParsedToRows,
  parseCSVText,
  resolveObraId,
  normText,
  type InventoryKind,
  type ImportRowResult,
  type ObraRef,
} from "@/lib/inventory-io";

interface ExportSpec {
  headers: string[];
  rows: (string | number)[][];
  filenameBase: string;
  pdfTitle: string;
  pdfSubtitle?: string;
}

interface Props {
  kind: InventoryKind;
  obras: ObraRef[];
  /** dados já filtrados na tela — é o que será exportado */
  exportSpec: ExportSpec;
  /** obra selecionada no contexto (pré-preenche importações sem obra) */
  defaultObraId?: string | null;
  canImport: boolean;
  /** chamado após importação bem-sucedida (ex.: invalidar queries) */
  onImported?: (stats: { created: number; updated: number }) => void;
  compact?: boolean;
}

interface StagedRow extends ImportRowResult {
  obra_id: string | null;
  action: "create" | "update" | "error";
  matchId?: string;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export function InventoryImportExport({
  kind,
  obras,
  exportSpec,
  defaultObraId,
  canImport,
  onImported,
  compact,
}: Props) {
  const schema = INVENTORY_SCHEMAS[kind];
  const fileRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState("");
  const [staged, setStaged] = useState<StagedRow[]>([]);
  const [missingHeaders, setMissingHeaders] = useState<string[]>([]);
  const [updateExisting, setUpdateExisting] = useState(true);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ created: number; updated: number } | null>(null);

  const validRows = useMemo(() => staged.filter((r) => r.action !== "error"), [staged]);
  const errorRows = useMemo(() => staged.filter((r) => r.action === "error"), [staged]);
  const toCreate = useMemo(() => validRows.filter((r) => r.action === "create").length, [validRows]);
  const toUpdate = useMemo(() => validRows.filter((r) => r.action === "update").length, [validRows]);

  const doExport = (type: "csv" | "pdf") => {
    if (exportSpec.rows.length === 0) {
      toast.error("Nada para exportar no filtro atual.");
      return;
    }
    if (type === "csv") {
      exportCSV(exportSpec.filenameBase, exportSpec.headers, exportSpec.rows);
      toast.success(`CSV exportado (${exportSpec.rows.length} item(ns))`);
    } else {
      if (!confirm(`Deseja baixar o PDF com ${exportSpec.rows.length} item(ns)?`)) return;
      exportPDF(exportSpec.pdfTitle, exportSpec.headers, exportSpec.rows, exportSpec.filenameBase, exportSpec.pdfSubtitle);
    }
  };

  const resetImport = () => {
    setStaged([]);
    setMissingHeaders([]);
    setFileName("");
    setResult(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const stageFile = async (file: File, allowUpdate: boolean) => {
    setResult(null);
    const text = await file.text();
    const parsed = parseCSVText(text);
    if (parsed.headers.length === 0) {
      toast.error("Arquivo vazio ou ilegível. Use o modelo CSV.");
      return;
    }
    if (parsed.rows.length === 0) {
      toast.error("O CSV tem só o cabeçalho — adicione ao menos 1 linha de dados.");
      return;
    }
    if (parsed.rows.length > 2000) {
      toast.error(`Arquivo com ${parsed.rows.length} linhas — limite de 2000 por importação. Divida o arquivo.`);
      return;
    }
    const { mapped, missingHeaders: miss } = mapParsedToRows(schema, parsed);
    setMissingHeaders(miss);
    if (miss.length > 0) {
      toast.error(`Cabeçalho obrigatório ausente: ${miss.join(", ")}`);
      setStaged([]);
      return;
    }

    // Busca existentes para detectar atualização (por código/CA ou nome+obra)
    let existing: any[] = [];
    try {
      const sel =
        kind === "materiais"
          ? "id, nome, codigo, obra_id"
          : kind === "epis"
            ? "id, nome, ca, obra_id"
            : "id, nome, codigo, obra_id";
      const { data, error } = await supabase.from(schema.table as any).select(sel).limit(5000);
      if (error) throw error;
      existing = data ?? [];
    } catch (e: any) {
      toast.error(`Não foi possível ler ${schema.label} existentes: ${e.message}`);
      return;
    }
    const byCode = new Map<string, any>();
    const byNameObra = new Map<string, any>();
    for (const ex of existing) {
      const code = kind === "epis" ? ex.ca : ex.codigo;
      if (code) byCode.set(`${normText(code)}`, ex);
      byNameObra.set(`${normText(ex.nome)}|${ex.obra_id ?? "__geral"}`, ex);
    }

    const next: StagedRow[] = mapped.map((m) => {
      const errors = [...m.errors];
      let obra_id: string | null = null;
      if (m.obraNomeRaw.trim() === "" && defaultObraId) {
        obra_id = defaultObraId;
      } else {
        const r = resolveObraId(m.obraNomeRaw, obras);
        if (r.error) errors.push(r.error);
        else obra_id = m.obraNomeRaw.trim() === "" ? null : r.obra_id;
      }
      if (errors.length > 0 || !m.payload) {
        return { ...m, obra_id, errors, action: "error" as const };
      }
      // matching
      let match: any = null;
      const dataAny = m.data as Record<string, string>;
      const codeKey = kind === "epis" ? normText(dataAny.ca ?? "") : normText(dataAny.codigo ?? "");
      if (codeKey) match = byCode.get(codeKey) ?? null;
      if (!match) match = byNameObra.get(`${normText(dataAny.nome ?? "")}|${obra_id ?? "__geral"}`) ?? null;
      if (match && !allowUpdate) {
        return { ...m, obra_id, errors: [`Já existe "${dataAny.nome}" (código/CA ou nome+obra) — ative "Atualizar itens existentes" ou remova a linha`], action: "error" as const };
      }
      return {
        ...m,
        obra_id,
        action: match ? ("update" as const) : ("create" as const),
        matchId: match?.id,
      };
    });

    setFileName(file.name);
    setStaged(next);
    const ok = next.filter((r) => r.action !== "error").length;
    const bad = next.length - ok;
    if (ok === 0) toast.error(`Nenhuma linha válida (${bad} com erro). Corrija e tente de novo.`);
    else toast.success(`${ok} linha(s) pronta(s)${bad ? ` — ${bad} com erro serão ignoradas` : ""}`);
  };

  const onPickFile = async (f: File | undefined) => {
    if (!f) return;
    if (!/\.csv$/i.test(f.name) && f.type !== "text/csv") {
      toast.error("Envie um arquivo .csv (use o modelo).");
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      toast.error("Arquivo maior que 5 MB.");
      return;
    }
    await stageFile(f, updateExisting);
  };

  const runImport = async () => {
    if (validRows.length === 0) {
      toast.error("Nenhuma linha válida para importar.");
      return;
    }
    setImporting(true);
    try {
      let created = 0;
      let updated = 0;
      const creates = validRows.filter((r) => r.action === "create");
      const updates = validRows.filter((r) => r.action === "update");

      for (const batch of chunk(creates, 100)) {
        const rows = batch.map((r) => {
          const p: Record<string, unknown> = { ...(r.payload as Record<string, unknown>) };
          // campos vazios de número viram null/0 conforme a tabela; mantém como está
          if (kind === "materiais") {
            if (p.unidade == null) p.unidade = "un";
            if (p.estoque_minimo == null) p.estoque_minimo = 0;
            if (p.estoque_atual == null) p.estoque_atual = 0;
          }
          if (kind === "epis") {
            if (!p.tipo) p.tipo = "EPI";
            if (p.estoque_minimo == null) p.estoque_minimo = 0;
            if (p.estoque_atual == null) p.estoque_atual = 0;
          }
          if (kind === "ferramentas" && !p.estado) p.estado = "disponivel";
          if (kind === "ativos" && !p.estado) p.estado = "em_uso";
          p.obra_id = r.obra_id;
          Object.keys(p).forEach((k) => {
            if (p[k] === "") p[k] = null;
          });
          delete (p as any).obra_nome;
          return p;
        });
        const { error } = await supabase.from(schema.table as any).insert(rows as any);
        if (error) throw new Error(`Erro ao criar ${rows.length} item(ns): ${error.message}`);
        created += rows.length;
      }

      // updates um a um (upsert por id é mais seguro p/ RLS + triggers de estoque)
      for (const r of updates) {
        const p: Record<string, unknown> = { ...(r.payload as Record<string, unknown>) };
        p.obra_id = r.obra_id;
        Object.keys(p).forEach((k) => {
          if (p[k] === "") p[k] = null;
        });
        delete (p as any).obra_nome;
        // nunca zera campo numérico ausente na planilha: remove chaves não informadas
        const { error } = await supabase.from(schema.table as any).update(p as any).eq("id", r.matchId as any);
        if (error) throw new Error(`Linha ${r.line}: ${error.message}`);
        updated += 1;
      }

      setResult({ created, updated });
      toast.success(`Importação concluída: ${created} criado(s), ${updated} atualizado(s)`);
      onImported?.({ created, updated });
    } catch (e: any) {
      toast.error(e.message ?? "Falha na importação");
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap gap-2 items-center">
        <Button variant="outline" size={compact ? "sm" : "sm"} onClick={() => doExport("csv")} title="Exporta os itens do filtro atual em CSV (Excel)">
          <FileDown className="h-4 w-4" /> CSV
        </Button>
        <Button variant="outline" size={compact ? "sm" : "sm"} onClick={() => doExport("pdf")} title="Exporta os itens do filtro atual em PDF">
          <FileText className="h-4 w-4" /> PDF
        </Button>
        <Button
          variant="outline"
          size={compact ? "sm" : "sm"}
          onClick={() => {
            downloadTemplate(kind);
            toast.success("Modelo CSV baixado — preencha e importe de volta.");
          }}
          title="Baixa a planilha modelo com o cabeçalho oficial e um exemplo"
        >
          <TableIcon className="h-4 w-4" /> Modelo CSV
        </Button>
        {canImport && (
          <Button
            size={compact ? "sm" : "sm"}
            onClick={() => {
              resetImport();
              setOpen(true);
            }}
            title="Importar itens a partir de um CSV no formato do modelo"
          >
            <FileUp className="h-4 w-4" /> Importar CSV
          </Button>
        )}
      </div>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) resetImport();
        }}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Importar {schema.label} via CSV</DialogTitle>
            <p className="text-sm text-muted-foreground">
              1) Baixe o <strong>Modelo CSV</strong>, preencha no Excel e salve como CSV. 2) Selecione o
              arquivo abaixo para validar. 3) Confira a prévia e confirme.
            </p>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-md border p-3 text-xs space-y-1 bg-muted/40">
              <p className="font-medium">Colunas oficiais: {schema.columns.map((c) => c.header).join(" · ")}</p>
              <p className="text-muted-foreground">
                Cabeçalho obrigatório: <strong>Nome</strong>
                {kind === "ferramentas" || kind === "ativos" ? "" : " (+ Estoque/quantidades podem ir zeradas)"}.
                {" "}Obra aceita o nome exato da obra ou <strong>Geral</strong> (vazio = Geral
                {defaultObraId ? " ou a obra do filtro atual" : ""}). Números aceitam vírgula decimal
                (32,90). Datas aceitam AAAA-MM-DD ou DD/MM/AAAA.
                {kind === "epis" ? " Tipo: EPI ou EPC." : ""}
                {kind === "ferramentas" ? " Estado: disponivel, emprestada, manutencao, descartada." : ""}
                {kind === "ativos" ? " Estado: em_uso, estoque, manutencao, baixado." : ""}
              </p>
              <p className="text-muted-foreground">
                Duplicados: compara por {kind === "epis" ? "CA" : "Código"} ou por Nome + Obra. Com
                “Atualizar itens existentes” ligado, a linha atualiza o cadastro; desligado, linhas
                duplicadas são bloqueadas.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-[1fr_auto] items-end">
              <div className="space-y-1">
                <Label>Arquivo CSV (máx. 5 MB, até 2000 linhas)</Label>
                <Input
                  ref={fileRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => onPickFile(e.target.files?.[0])}
                />
              </div>
              <label className="flex items-center gap-2 text-sm pb-2">
                <Checkbox
                  checked={updateExisting}
                  onCheckedChange={(v) => {
                    const next = v === true;
                    setUpdateExisting(next);
                    if (fileRef.current?.files?.[0]) stageFile(fileRef.current.files[0], next);
                  }}
                />
                Atualizar itens existentes
              </label>
            </div>

            {missingHeaders.length > 0 && (
              <p className="text-sm text-destructive flex items-center gap-1">
                <AlertTriangle className="h-4 w-4" /> Cabeçalho ausente: {missingHeaders.join(", ")}
              </p>
            )}

            {staged.length > 0 && (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="px-2 py-1 rounded bg-muted font-medium">
                    {fileName} — {staged.length} linha(s)
                  </span>
                  <span className="px-2 py-1 rounded bg-emerald-500/15 text-emerald-700 font-medium">
                    {toCreate} a criar
                  </span>
                  <span className="px-2 py-1 rounded bg-sky-500/15 text-sky-700 font-medium">
                    {toUpdate} a atualizar
                  </span>
                  {errorRows.length > 0 && (
                    <span className="px-2 py-1 rounded bg-destructive/15 text-destructive font-medium">
                      {errorRows.length} com erro
                    </span>
                  )}
                </div>

                <div className="border rounded-md overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/50 text-left">
                        <th className="p-2">Linha</th>
                        <th className="p-2">Ação</th>
                        {schema.columns.map((c) => (
                          <th key={c.key} className="p-2 whitespace-nowrap">
                            {c.header}
                          </th>
                        ))}
                        <th className="p-2">Erros</th>
                      </tr>
                    </thead>
                    <tbody>
                      {staged.slice(0, 50).map((r) => (
                        <tr key={r.line} className="border-b align-top">
                          <td className="p-2">{r.line}</td>
                          <td className="p-2">
                            {r.action === "create" && <span className="text-emerald-700 font-medium">criar</span>}
                            {r.action === "update" && <span className="text-sky-700 font-medium">atualizar</span>}
                            {r.action === "error" && <span className="text-destructive font-medium">erro</span>}
                          </td>
                          {schema.columns.map((c) => (
                            <td key={c.key} className="p-2 max-w-40 truncate" title={r.data[c.key]}>
                              {c.key === "obra_nome" ? r.obraNomeRaw || "Geral" : r.data[c.key]}
                            </td>
                          ))}
                          <td className="p-2 text-destructive max-w-60">
                            {r.errors.join(" | ") || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {staged.length > 50 && (
                    <p className="p-2 text-xs text-muted-foreground">
                      Mostrando 50 de {staged.length} linhas — as demais serão validadas da mesma forma.
                    </p>
                  )}
                </div>
              </div>
            )}

            {result && (
              <p className="text-sm text-emerald-700 flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4" /> Última importação: {result.created} criado(s),{" "}
                {result.updated} atualizado(s). Você pode fechar ou importar outro arquivo.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {result ? "Fechar" : "Cancelar"}
            </Button>
            <Button disabled={validRows.length === 0 || importing} onClick={runImport}>
              {importing ? "Importando..." : `Confirmar importação (${validRows.length})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
