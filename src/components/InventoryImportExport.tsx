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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  FileDown,
  FileText,
  FileUp,
  Table as TableIcon,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Search,
  Filter,
  ListChecks,
} from "lucide-react";
import { toast } from "sonner";
import { exportCSV, exportPDF } from "@/lib/exports";
import {
  INVENTORY_SCHEMAS,
  downloadSelectedAsTemplate,
  downloadTemplate,
  filterExportColumns,
  isQuantityOrValueHeader,
  mapParsedToRows,
  parseCSVText,
  resolveObraId,
  normText,
  type InventoryKind,
  type ImportRowResult,
  type ObraRef,
  type TemplateMode,
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
  selected?: boolean;
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
  const [detectedColumns, setDetectedColumns] = useState<string[]>([]);
  const [missingHeaders, setMissingHeaders] = useState<string[]>([]);
  const [updateExisting, setUpdateExisting] = useState(true);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ created: number; updated: number } | null>(null);

  // Filtros internos na lista de importação
  const [filterAction, setFilterAction] = useState<"all" | "selected" | "create" | "update" | "error">("all");
  const [searchTerm, setSearchTerm] = useState("");

  // Exportação de itens selecionados (com / sem quantidades)
  const [exportSelOpen, setExportSelOpen] = useState(false);
  const [exportSelSearch, setExportSelSearch] = useState("");
  const [exportSelChecked, setExportSelChecked] = useState<number[]>([]);
  const [includeQty, setIncludeQty] = useState(true);

  const validRows = useMemo(() => staged.filter((r) => r.action !== "error"), [staged]);
  const errorRows = useMemo(() => staged.filter((r) => r.action === "error"), [staged]);
  const toCreate = useMemo(() => validRows.filter((r) => r.action === "create").length, [validRows]);
  const toUpdate = useMemo(() => validRows.filter((r) => r.action === "update").length, [validRows]);

  // Linhas selecionadas pelo usuário que estão aptas a serem importadas
  const selectedRows = useMemo(
    () => staged.filter((r) => r.selected && r.action !== "error"),
    [staged],
  );

  // Linhas visíveis na tabela com base na busca e filtro de ação
  const filteredStaged = useMemo(() => {
    return staged.filter((r) => {
      if (filterAction === "selected" && !r.selected) return false;
      if (filterAction === "create" && r.action !== "create") return false;
      if (filterAction === "update" && r.action !== "update") return false;
      if (filterAction === "error" && r.action !== "error") return false;

      if (searchTerm.trim()) {
        const q = normText(searchTerm);
        const dataValues = Object.values(r.data).map(normText).join(" ");
        const obraMatch = normText(r.obraNomeRaw).includes(q);
        const errMatch = r.errors.some((e) => normText(e).includes(q));
        if (!dataValues.includes(q) && !obraMatch && !errMatch) {
          return false;
        }
      }
      return true;
    });
  }, [staged, filterAction, searchTerm]);

  const allFilteredSelected = useMemo(() => {
    const validFiltered = filteredStaged.filter((r) => r.action !== "error");
    if (validFiltered.length === 0) return false;
    return validFiltered.every((r) => r.selected);
  }, [filteredStaged]);

  const toggleSelectFiltered = (checked: boolean) => {
    const filteredLineSet = new Set(
      filteredStaged.filter((r) => r.action !== "error").map((r) => r.line),
    );
    setStaged((prev) =>
      prev.map((r) => {
        if (filteredLineSet.has(r.line)) {
          return { ...r, selected: checked };
        }
        return r;
      }),
    );
  };

  const toggleSelectRow = (line: number) => {
    setStaged((prev) =>
      prev.map((r) => (r.line === line ? { ...r, selected: !r.selected } : r)),
    );
  };

  // ---- Itens selecionados para exportação ----
  const qtyHeadersInSpec = useMemo(
    () => exportSpec.headers.filter((h) => isQuantityOrValueHeader(h)),
    [exportSpec.headers],
  );
  const hasQtyColumns = qtyHeadersInSpec.length > 0;

  const exportSelFilteredIdx = useMemo(() => {
    const q = normText(exportSelSearch);
    return exportSpec.rows
      .map((_, i) => i)
      .filter((i) => {
        if (!q) return true;
        return exportSpec.rows[i].map((v) => normText(v)).join(" ").includes(q);
      });
  }, [exportSpec.rows, exportSelSearch]);

  const exportSelCheckedSet = useMemo(() => new Set(exportSelChecked), [exportSelChecked]);
  const exportSelSelectedRows = useMemo(
    () => exportSelChecked.filter((i) => i >= 0 && i < exportSpec.rows.length).map((i) => exportSpec.rows[i]),
    [exportSelChecked, exportSpec.rows],
  );
  const allExportFilteredChecked = useMemo(() => {
    if (exportSelFilteredIdx.length === 0) return false;
    return exportSelFilteredIdx.every((i) => exportSelCheckedSet.has(i));
  }, [exportSelFilteredIdx, exportSelCheckedSet]);

  const openExportSelection = (withQuantities: boolean) => {
    if (exportSpec.rows.length === 0) {
      toast.error("Nada para selecionar no filtro atual.");
      return;
    }
    setIncludeQty(hasQtyColumns ? withQuantities : true);
    setExportSelSearch("");
    setExportSelChecked(exportSpec.rows.map((_, i) => i));
    setExportSelOpen(true);
  };

  const toggleExportSelOne = (idx: number) => {
    setExportSelChecked((prev) => (prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]));
  };

  const toggleExportSelFiltered = (checked: boolean) => {
    setExportSelChecked((prev) => {
      const set = new Set(prev);
      if (checked) exportSelFilteredIdx.forEach((i) => set.add(i));
      else exportSelFilteredIdx.forEach((i) => set.delete(i));
      return [...set].sort((a, b) => a - b);
    });
  };

  const exportSelectionPreview = useMemo(() => {
    const rawRows = exportSelSelectedRows as (string | number | null | undefined)[][];
    if (!hasQtyColumns) return { headers: exportSpec.headers, rows: rawRows, removed: [] as string[] };
    return filterExportColumns(exportSpec.headers, rawRows, includeQty);
  }, [exportSelSelectedRows, exportSpec.headers, includeQty, hasQtyColumns]);

  const doExportSelected = (type: "csv" | "pdf" | "template") => {
    if (exportSelSelectedRows.length === 0) {
      toast.error("Selecione pelo menos 1 item para exportar.");
      return;
    }
    const qtySuffix = hasQtyColumns ? (includeQty ? "com-quantidades" : "sem-quantidades") : "selecionados";
    if (type === "template") {
      const mode: TemplateMode = includeQty ? "itens_quantidades" : "somente_itens";
      downloadSelectedAsTemplate(kind, exportSpec.headers, exportSelSelectedRows as any, mode);
      toast.success(
        `Modelo preenchido (${exportSelSelectedRows.length} item(ns), ${includeQty ? "com" : "sem"} quantidades) baixado — edite e importe de volta.`,
      );
      return;
    }
    if (type === "csv") {
      exportCSV(`${exportSpec.filenameBase}-${qtySuffix}`, exportSelectionPreview.headers, exportSelectionPreview.rows as any);
      toast.success(
        `CSV exportado (${exportSelectionPreview.rows.length} item(ns) ${includeQty ? "com" : "sem"} quantidades)`,
      );
    } else {
      if (!confirm(`Deseja baixar o PDF com ${exportSelectionPreview.rows.length} item(ns) selecionado(s)?`)) return;
      exportPDF(
        `${exportSpec.pdfTitle} — selecionados`,
        exportSelectionPreview.headers,
        exportSelectionPreview.rows as any,
        `${exportSpec.filenameBase}-${qtySuffix}`,
        `${exportSpec.pdfSubtitle ?? ""} | ${exportSelectionPreview.rows.length} selecionado(s) | ${includeQty ? "Com" : "Sem"} quantidades/valores`,
      );
    }
  };

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
      exportPDF(
        exportSpec.pdfTitle,
        exportSpec.headers,
        exportSpec.rows,
        exportSpec.filenameBase,
        exportSpec.pdfSubtitle,
      );
    }
  };

  const handleDownloadTemplate = (mode: TemplateMode) => {
    downloadTemplate(kind, mode);
    const modeLabel =
      mode === "somente_itens"
        ? "Somente Itens"
        : mode === "itens_quantidades"
          ? "Itens + Quantidades"
          : "Completo";
    toast.success(`Modelo CSV (${modeLabel}) baixado — preencha e importe de volta.`);
  };

  const resetImport = () => {
    setStaged([]);
    setDetectedColumns([]);
    setMissingHeaders([]);
    setFileName("");
    setResult(null);
    setSearchTerm("");
    setFilterAction("all");
    if (fileRef.current) fileRef.current.value = "";
  };

  const stageFile = async (file: File, allowUpdate: boolean) => {
    if (!canImport) {
      toast.error("Você não tem permissão para importar dados.");
      return;
    }
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
    const { mapped, missingHeaders: miss, colIndex } = mapParsedToRows(schema, parsed);
    setMissingHeaders(miss);
    if (miss.length > 0) {
      toast.error(`Cabeçalho obrigatório ausente: ${miss.join(", ")}`);
      setStaged([]);
      return;
    }

    // Identifica colunas presentes no arquivo para exibir na tabela de conferência
    const presentKeys = schema.columns
      .filter((c) => colIndex.has(c.key))
      .map((c) => c.key);
    setDetectedColumns(presentKeys.length > 0 ? presentKeys : schema.columns.map((c) => c.key));

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
        return { ...m, obra_id, errors, action: "error" as const, selected: false };
      }
      // matching
      let match: any = null;
      const dataAny = m.data as Record<string, string>;
      const codeKey = kind === "epis" ? normText(dataAny.ca ?? "") : normText(dataAny.codigo ?? "");
      if (codeKey) match = byCode.get(codeKey) ?? null;
      if (!match) match = byNameObra.get(`${normText(dataAny.nome ?? "")}|${obra_id ?? "__geral"}`) ?? null;
      if (match && !allowUpdate) {
        return {
          ...m,
          obra_id,
          errors: [
            `Já existe "${dataAny.nome}" (código/CA ou nome+obra) — ative "Atualizar itens existentes" ou remova a linha`,
          ],
          action: "error" as const,
          selected: false,
        };
      }
      return {
        ...m,
        obra_id,
        action: match ? ("update" as const) : ("create" as const),
        matchId: match?.id,
        selected: true, // selecionado por padrão para importação
      };
    });

    setFileName(file.name);
    setStaged(next);
    const ok = next.filter((r) => r.action !== "error").length;
    const bad = next.length - ok;
    if (ok === 0) toast.error(`Nenhuma linha válida (${bad} com erro). Corrija e tente de novo.`);
    else toast.success(`${ok} linha(s) pronta(s)${bad ? ` — ${bad} com erro ignoradas` : ""}`);
  };

  const onPickFile = async (f: File | undefined) => {
    if (!canImport) {
      toast.error("Você não tem permissão para importar dados.");
      return;
    }
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
    if (!canImport) {
      toast.error("Você não tem permissão para importar dados.");
      return;
    }
    if (selectedRows.length === 0) {
      toast.error("Selecione pelo menos um item válido para importar.");
      return;
    }
    setImporting(true);
    try {
      let created = 0;
      let updated = 0;
      const creates = selectedRows.filter((r) => r.action === "create");
      const updates = selectedRows.filter((r) => r.action === "update");

      for (const batch of chunk(creates, 100)) {
        const rows = batch.map((r) => {
          const p: Record<string, unknown> = { ...(r.payload as Record<string, unknown>) };
          // campos padrão apenas para novos itens criados
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

      // updates: apenas atualiza os campos que realmente foram informados no payload
      for (const r of updates) {
        const p: Record<string, unknown> = { ...(r.payload as Record<string, unknown>) };
        if (r.obraNomeRaw.trim() !== "" || defaultObraId) {
          p.obra_id = r.obra_id;
        }
        Object.keys(p).forEach((k) => {
          if (p[k] === "") p[k] = null;
        });
        delete (p as any).obra_nome;

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

  // Colunas a renderizar na tabela de pré-visualização
  const visibleCols = useMemo(() => {
    if (detectedColumns.length === 0) return schema.columns;
    return schema.columns.filter((c) => detectedColumns.includes(c.key));
  }, [schema.columns, detectedColumns]);

  return (
    <>
      <div className="flex flex-wrap gap-2 items-center">
        <Button
          variant="outline"
          size={compact ? "sm" : "sm"}
          onClick={() => doExport("csv")}
          title="Exporta os itens do filtro atual em CSV (Excel)"
        >
          <FileDown className="h-4 w-4" /> CSV
        </Button>
        <Button
          variant="outline"
          size={compact ? "sm" : "sm"}
          onClick={() => doExport("pdf")}
          title="Exporta os itens do filtro atual em PDF"
        >
          <FileText className="h-4 w-4" /> PDF
        </Button>

        {/* Dropdown com opções de modelo */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size={compact ? "sm" : "sm"}
              title="Baixar planilha modelo CSV para importação"
              className="gap-1"
            >
              <TableIcon className="h-4 w-4" /> Modelo CSV
              <ChevronDown className="h-3 w-3 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuItem onClick={() => handleDownloadTemplate("somente_itens")}>
              <div className="flex flex-col text-left">
                <span className="font-medium text-xs">Somente os itens</span>
                <span className="text-[10px] text-muted-foreground">Nome, código e identificadores básicos</span>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleDownloadTemplate("itens_quantidades")}>
              <div className="flex flex-col text-left">
                <span className="font-medium text-xs">Itens e quantidades</span>
                <span className="text-[10px] text-muted-foreground">Itens, estoque atual e estoque mínimo</span>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleDownloadTemplate("completo")}>
              <div className="flex flex-col text-left">
                <span className="font-medium text-xs">Modelo completo</span>
                <span className="text-[10px] text-muted-foreground">Todas as colunas suportadas pelo módulo</span>
              </div>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => openExportSelection(true)}>
              <div className="flex flex-col text-left">
                <span className="font-medium text-xs">Itens selecionados…</span>
                <span className="text-[10px] text-muted-foreground">
                  Escolher itens do filtro atual e baixar preenchido, com ou sem quantidades
                </span>
              </div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Menu de exportação por itens selecionados */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size={compact ? "sm" : "sm"}
              title="Escolher quais itens do filtro atual serão exportados, com ou sem quantidades"
              className="gap-1"
            >
              <ListChecks className="h-4 w-4" /> Itens selecionados
              <ChevronDown className="h-3 w-3 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuItem onClick={() => openExportSelection(true)}>
              <div className="flex flex-col text-left">
                <span className="font-medium text-xs">Com quantidades</span>
                <span className="text-[10px] text-muted-foreground">
                  Escolher itens e exportar com estoque/valores{qtyHeadersInSpec.length > 0 ? ` (${qtyHeadersInSpec.join(", ")})` : ""}
                </span>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => openExportSelection(false)} disabled={!hasQtyColumns}>
              <div className="flex flex-col text-left">
                <span className="font-medium text-xs">Sem quantidades</span>
                <span className="text-[10px] text-muted-foreground">
                  {hasQtyColumns
                    ? "Escolher itens e exportar só identificação (sem estoque/valores)"
                    : "Este módulo não tem colunas de quantidade/valor no relatório"}
                </span>
              </div>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <div className="px-2 py-1.5 text-[10px] text-muted-foreground">
              {exportSpec.rows.length} item(ns) no filtro atual — a escolha é feita na próxima tela.
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

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
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Importar {schema.label} via CSV</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Você pode importar <strong>somente os itens</strong>, <strong>itens e quantidades</strong> ou selecionar <strong>itens específicos</strong> antes de confirmar.
            </p>
          </DialogHeader>

          <div className="space-y-4">
            {/* Bloco de ajuda e templates */}
            <div className="rounded-md border p-3 text-xs space-y-2 bg-muted/40">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
                <span className="font-semibold text-foreground">Formatos de importação aceitos:</span>
                <div className="flex flex-wrap gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 text-[11px] px-2"
                    onClick={() => handleDownloadTemplate("somente_itens")}
                  >
                    Baixar: Somente Itens
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 text-[11px] px-2"
                    onClick={() => handleDownloadTemplate("itens_quantidades")}
                  >
                    Baixar: Itens + Quantidades
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 text-[11px] px-2"
                    onClick={() => handleDownloadTemplate("completo")}
                  >
                    Baixar: Completo
                  </Button>
                </div>
              </div>
              <p className="text-muted-foreground">
                • <strong>Somente os itens:</strong> basta o cabeçalho <code>Nome</code> (e Código se houver). Estoque e outros campos ficarão zerados/padrão.<br />
                • <strong>Itens e quantidades:</strong> inclua a coluna <code>Estoque</code> (ou Qtd). Novos cadastros entram com a quantidade e itens existentes são atualizados.<br />
                • <strong>Somente alguns itens específicos:</strong> após carregar a planilha, use os checkboxes da tabela abaixo para escolher exatamente quais itens importar.
              </p>
            </div>

            {/* Upload e opção de atualizar existentes */}
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
              <label className="flex items-center gap-2 text-sm pb-2 cursor-pointer select-none">
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
              <div className="space-y-3">
                {/* Barra de status e contagens */}
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex flex-wrap gap-1.5 items-center">
                    <span className="px-2 py-1 rounded bg-muted font-medium">
                      {fileName} — {staged.length} linha(s) no arquivo
                    </span>
                    <span className="px-2 py-1 rounded bg-primary/10 text-primary font-semibold">
                      {selectedRows.length} selecionado(s) para importar
                    </span>
                    <span className="px-2 py-1 rounded bg-emerald-500/15 text-emerald-700 font-medium">
                      {toCreate} novos
                    </span>
                    <span className="px-2 py-1 rounded bg-sky-500/15 text-sky-700 font-medium">
                      {toUpdate} existentes
                    </span>
                    {errorRows.length > 0 && (
                      <span className="px-2 py-1 rounded bg-destructive/15 text-destructive font-medium">
                        {errorRows.length} com erro
                      </span>
                    )}
                  </div>
                </div>

                {/* Filtros e seleção rápida de itens específicos */}
                <div className="flex flex-wrap items-center justify-between gap-2 bg-muted/20 p-2 rounded-md border text-xs">
                  <div className="flex items-center gap-2 flex-1 min-w-[200px] max-w-sm">
                    <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <Input
                      placeholder="Filtrar itens na lista..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="h-7 text-xs"
                    />
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Filter className="h-3.5 w-3.5 text-muted-foreground mr-0.5" />
                    <span className="text-muted-foreground">Exibir:</span>
                    <Button
                      type="button"
                      variant={filterAction === "all" ? "default" : "outline"}
                      size="sm"
                      className="h-6 text-[11px] px-2"
                      onClick={() => setFilterAction("all")}
                    >
                      Todos ({staged.length})
                    </Button>
                    <Button
                      type="button"
                      variant={filterAction === "selected" ? "default" : "outline"}
                      size="sm"
                      className="h-6 text-[11px] px-2"
                      onClick={() => setFilterAction("selected")}
                    >
                      Selecionados ({selectedRows.length})
                    </Button>
                    <Button
                      type="button"
                      variant={filterAction === "create" ? "default" : "outline"}
                      size="sm"
                      className="h-6 text-[11px] px-2"
                      onClick={() => setFilterAction("create")}
                    >
                      Novos ({toCreate})
                    </Button>
                    <Button
                      type="button"
                      variant={filterAction === "update" ? "default" : "outline"}
                      size="sm"
                      className="h-6 text-[11px] px-2"
                      onClick={() => setFilterAction("update")}
                    >
                      Atualizações ({toUpdate})
                    </Button>
                    {errorRows.length > 0 && (
                      <Button
                        type="button"
                        variant={filterAction === "error" ? "destructive" : "outline"}
                        size="sm"
                        className="h-6 text-[11px] px-2"
                        onClick={() => setFilterAction("error")}
                      >
                        Erros ({errorRows.length})
                      </Button>
                    )}
                  </div>
                </div>

                {/* Tabela de itens com checkbox individual para importar apenas itens específicos */}
                <div className="border rounded-md overflow-x-auto max-h-[380px] overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-muted z-10">
                      <tr className="border-b text-left">
                        <th className="p-2 w-10 text-center">
                          <Checkbox
                            checked={allFilteredSelected}
                            onCheckedChange={(v) => toggleSelectFiltered(v === true)}
                            title="Selecionar ou desmarcar todos os itens válidos desta visualização"
                          />
                        </th>
                        <th className="p-2">Linha</th>
                        <th className="p-2">Ação</th>
                        {visibleCols.map((c) => (
                          <th key={c.key} className="p-2 whitespace-nowrap">
                            {c.header}
                          </th>
                        ))}
                        <th className="p-2">Situação / Erros</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStaged.slice(0, 100).map((r) => {
                        const isErr = r.action === "error";
                        return (
                          <tr
                            key={r.line}
                            className={`border-b align-middle transition-colors ${
                              isErr
                                ? "bg-destructive/5 opacity-70"
                                : r.selected
                                  ? "bg-primary/[0.03] hover:bg-primary/[0.06]"
                                  : "opacity-60 hover:opacity-100"
                            }`}
                          >
                            <td className="p-2 text-center">
                              <Checkbox
                                disabled={isErr}
                                checked={!!r.selected}
                                onCheckedChange={() => toggleSelectRow(r.line)}
                                title={isErr ? "Item com erro não pode ser importado" : "Marque para importar este item"}
                              />
                            </td>
                            <td className="p-2 text-muted-foreground font-mono">{r.line}</td>
                            <td className="p-2">
                              {r.action === "create" && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/15 text-emerald-700 font-semibold">
                                  novo
                                </span>
                              )}
                              {r.action === "update" && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-sky-500/15 text-sky-700 font-semibold">
                                  atualizar
                                </span>
                              )}
                              {r.action === "error" && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-destructive/15 text-destructive font-semibold">
                                  erro
                                </span>
                              )}
                            </td>
                            {visibleCols.map((c) => (
                              <td key={c.key} className="p-2 max-w-44 truncate" title={r.data[c.key]}>
                                {c.key === "obra_nome"
                                  ? r.obraNomeRaw || (defaultObraId ? "Obra padrão" : "Geral")
                                  : r.data[c.key] || <span className="text-muted-foreground/50">—</span>}
                              </td>
                            ))}
                            <td className="p-2 text-xs">
                              {r.errors.length > 0 ? (
                                <span className="text-destructive font-medium">{r.errors.join(" | ")}</span>
                              ) : r.selected ? (
                                <span className="text-emerald-700 text-[11px]">Pronto para importar</span>
                              ) : (
                                <span className="text-muted-foreground text-[11px]">Não selecionado</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {filteredStaged.length > 100 && (
                    <p className="p-2 text-xs text-muted-foreground border-t bg-muted/20">
                      Mostrando 100 de {filteredStaged.length} itens. A ação de seleção afeta os itens filtrados.
                    </p>
                  )}
                  {filteredStaged.length === 0 && (
                    <div className="p-6 text-center text-xs text-muted-foreground">
                      Nenhum item encontrado com os filtros atuais.
                    </div>
                  )}
                </div>
              </div>
            )}

            {result && (
              <p className="text-sm text-emerald-700 flex items-center gap-1 font-medium bg-emerald-500/10 p-2.5 rounded-md border border-emerald-500/20">
                <CheckCircle2 className="h-4 w-4 shrink-0" /> Última importação concluída: {result.created} criado(s) e{" "}
                {result.updated} atualizado(s).
              </p>
            )}
          </div>

          <DialogFooter className="flex flex-col sm:flex-row items-center justify-between gap-2 border-t pt-3">
            <div className="text-xs text-muted-foreground w-full sm:w-auto text-left">
              {staged.length > 0 && (
                <span>
                  <strong>{selectedRows.length}</strong> de {validRows.length} itens válidos selecionados
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                {result ? "Fechar" : "Cancelar"}
              </Button>
              <Button
                disabled={selectedRows.length === 0 || importing}
                onClick={runImport}
              >
                {importing
                  ? "Importando..."
                  : `Confirmar importação (${selectedRows.length})`}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: exportar itens selecionados (com / sem quantidades) */}
      <Dialog open={exportSelOpen} onOpenChange={setExportSelOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Exportar itens selecionados — {schema.label}</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Escolha quais itens do filtro atual ({exportSpec.rows.length}) vão para o arquivo e se a
              exportação inclui <strong>quantidades/valores</strong> ou só a identificação.
            </p>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 p-2.5 text-xs">
              <label className="flex items-center gap-2 cursor-pointer select-none font-medium">
                <Checkbox
                  checked={hasQtyColumns ? includeQty : true}
                  disabled={!hasQtyColumns}
                  onCheckedChange={(v) => setIncludeQty(v === true)}
                />
                Incluir quantidades e valores
              </label>
              <span className="text-muted-foreground">
                {hasQtyColumns ? (
                  <>
                    {includeQty ? (
                      <>Com: {exportSelectionPreview.headers.join(" · ")}</>
                    ) : (
                      <>
                        Sem: remove {exportSelectionPreview.removed.join(", ")} — sai só{" "}
                        {exportSelectionPreview.headers.join(", ")}
                      </>
                    )}
                  </>
                ) : (
                  <>Este módulo não tem colunas de quantidade/valor no relatório — sai o relatório completo.</>
                )}
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-1 min-w-[200px] max-w-sm">
                <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <Input
                  placeholder="Filtrar itens para selecionar..."
                  value={exportSelSearch}
                  onChange={(e) => setExportSelSearch(e.target.value)}
                  className="h-7 text-xs"
                />
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <span className="px-2 py-1 rounded bg-primary/10 text-primary font-semibold">
                  {exportSelChecked.length} selecionado(s)
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-6 text-[11px] px-2"
                  onClick={() => toggleExportSelFiltered(true)}
                >
                  Todos do filtro
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-6 text-[11px] px-2"
                  onClick={() => toggleExportSelFiltered(false)}
                >
                  Nenhum
                </Button>
              </div>
            </div>

            <div className="border rounded-md overflow-x-auto max-h-[380px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted z-10">
                  <tr className="border-b text-left">
                    <th className="p-2 w-10 text-center">
                      <Checkbox
                        checked={allExportFilteredChecked}
                        onCheckedChange={(v) => toggleExportSelFiltered(v === true)}
                        title="Selecionar ou desmarcar todos os itens desta visualização"
                      />
                    </th>
                    {exportSelectionPreview.headers.map((h) => (
                      <th key={h} className="p-2 whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {exportSelFilteredIdx.slice(0, 200).map((rowIdx) => {
                    const checked = exportSelCheckedSet.has(rowIdx);
                    const row = exportSpec.rows[rowIdx] ?? [];
                    // Mapeia a linha do relatório para as colunas visíveis (com/sem quantidades)
                    const previewRow = hasQtyColumns
                      ? (() => {
                          const kept = exportSpec.headers
                            .map((h, i) => ({ h, i }))
                            .filter(({ h }) =>
                              includeQty ? true : !isQuantityOrValueHeader(h),
                            )
                            .map(({ i }) => i);
                          return kept.map((i) => row[i]);
                        })()
                      : row;
                    return (
                      <tr
                        key={rowIdx}
                        className={`border-b align-middle transition-colors ${
                          checked ? "bg-primary/[0.03] hover:bg-primary/[0.06]" : "opacity-60 hover:opacity-100"
                        }`}
                      >
                        <td className="p-2 text-center">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggleExportSelOne(rowIdx)}
                            title="Marque para incluir este item na exportação"
                          />
                        </td>
                        {previewRow.map((v, ci) => (
                          <td
                            key={ci}
                            className="p-2 max-w-44 truncate"
                            title={String(v ?? "")}
                          >
                            {String(v ?? "") || <span className="text-muted-foreground/50">—</span>}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {exportSelFilteredIdx.length > 200 && (
                <p className="p-2 text-xs text-muted-foreground border-t bg-muted/20">
                  Mostrando 200 de {exportSelFilteredIdx.length} itens. Use a busca para refinar — a seleção
                  é mantida.
                </p>
              )}
              {exportSelFilteredIdx.length === 0 && (
                <div className="p-6 text-center text-xs text-muted-foreground">
                  Nenhum item encontrado com a busca atual.
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="flex flex-col sm:flex-row items-center justify-between gap-2 border-t pt-3">
            <div className="text-xs text-muted-foreground w-full sm:w-auto text-left">
              <strong>{exportSelChecked.length}</strong> de {exportSpec.rows.length} itens ·{" "}
              {includeQty ? "com" : "sem"} quantidades/valores
            </div>
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
              <Button variant="ghost" onClick={() => setExportSelOpen(false)}>
                Cancelar
              </Button>
              <Button
                variant="outline"
                disabled={exportSelChecked.length === 0}
                onClick={() => doExportSelected("template")}
                title="Baixa os itens marcados já preenchidos no formato do modelo de importação"
              >
                <TableIcon className="h-4 w-4" /> Modelo preenchido ({exportSelChecked.length})
              </Button>
              <Button
                variant="outline"
                disabled={exportSelChecked.length === 0}
                onClick={() => doExportSelected("pdf")}
              >
                <FileText className="h-4 w-4" /> PDF ({exportSelChecked.length})
              </Button>
              <Button disabled={exportSelChecked.length === 0} onClick={() => doExportSelected("csv")}>
                <FileDown className="h-4 w-4" /> CSV ({exportSelChecked.length})
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

