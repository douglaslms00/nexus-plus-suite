// Utilitários compartilhados de importação / exportação de inventário (CSV).
// Usado por Materiais, EPIs, Ferramentas e Ativos.
// O formato oficial de troca é CSV com BOM, delimitado por ";" (abre direto no Excel pt-BR).

export type InventoryKind = "materiais" | "epis" | "ferramentas" | "ativos";

export interface ObraRef {
  id: string;
  nome: string;
}

export type ColumnType = "text" | "number" | "date" | "enum";

export interface ColumnDef {
  /** chave usada no payload do Supabase */
  key: string;
  /** cabeçalho oficial no CSV (pt-BR) */
  header: string;
  /** apelidos aceitos no cabeçalho (minúsculos, sem acento) */
  aliases: string[];
  required?: boolean;
  type?: ColumnType;
  options?: string[];
  example?: string;
  hint?: string;
}

export interface InventorySchema {
  kind: InventoryKind;
  table: string;
  label: string;
  matchKeys: string[];
  columns: ColumnDef[];
}

const OBRA_COL: ColumnDef = {
  key: "obra_nome",
  header: "Obra",
  aliases: ["obra", "obra_nome", "obra nome"],
  hint: 'Nome da obra como aparece no sistema, ou "Geral" para sem obra.',
  example: "Geral",
};

export const INVENTORY_SCHEMAS: Record<InventoryKind, InventorySchema> = {
  materiais: {
    kind: "materiais",
    table: "materiais",
    label: "Materiais",
    matchKeys: ["codigo", "nome"],
    columns: [
      { key: "nome", header: "Nome", aliases: ["nome"], required: true, type: "text", example: "Cimento CP-II 50kg" },
      { key: "codigo", header: "Código", aliases: ["codigo", "cod", "sku"], type: "text", example: "CIM-001" },
      { key: "unidade", header: "Unidade", aliases: ["unidade", "un", "und"], type: "text", example: "sc" },
      OBRA_COL,
      { key: "estoque_atual", header: "Estoque", aliases: ["estoque", "estoque_atual", "estoque atual", "qtd", "quantidade"], type: "number", example: "100" },
      { key: "estoque_minimo", header: "Estoque mínimo", aliases: ["estoque_minimo", "estoque minimo", "minimo", "mínimo"], type: "number", example: "10" },
      { key: "preco_medio", header: "Preço médio", aliases: ["preco_medio", "preco medio", "preço médio", "preco", "preço", "valor"], type: "number", example: "32,90" },
      { key: "descricao", header: "Descrição", aliases: ["descricao", "descrição", "obs", "observacao"], type: "text", example: "Saco 50kg" },
    ],
  },
  epis: {
    kind: "epis",
    table: "epis",
    label: "EPIs / EPCs",
    matchKeys: ["ca", "nome"],
    columns: [
      { key: "nome", header: "Nome", aliases: ["nome"], required: true, type: "text", example: "Capacete aba frontal" },
      {
        key: "tipo",
        header: "Tipo",
        aliases: ["tipo"],
        type: "enum",
        options: ["EPI", "EPC"],
        example: "EPI",
        hint: "EPI ou EPC.",
      },
      { key: "ca", header: "CA", aliases: ["ca", "c.a.", "certificado"], type: "text", example: "12345" },
      OBRA_COL,
      { key: "estoque_atual", header: "Estoque", aliases: ["estoque", "estoque_atual", "estoque atual", "qtd"], type: "number", example: "50" },
      { key: "estoque_minimo", header: "Estoque mínimo", aliases: ["estoque_minimo", "estoque minimo", "minimo"], type: "number", example: "5" },
      { key: "validade_meses", header: "Validade (meses)", aliases: ["validade_meses", "validade", "validade meses", "meses"], type: "number", example: "12" },
    ],
  },
  ferramentas: {
    kind: "ferramentas",
    table: "ferramentas",
    label: "Ferramentas",
    matchKeys: ["codigo", "nome"],
    columns: [
      { key: "nome", header: "Nome", aliases: ["nome"], required: true, type: "text", example: "Furadeira de impacto" },
      { key: "codigo", header: "Código", aliases: ["codigo", "cod", "patrimonio", "patrimônio"], type: "text", example: "FER-001" },
      {
        key: "estado",
        header: "Estado",
        aliases: ["estado", "status", "situacao", "situação"],
        type: "enum",
        options: ["disponivel", "emprestada", "manutencao", "descartada"],
        example: "disponivel",
      },
      OBRA_COL,
      { key: "proxima_manutencao", header: "Próx. manutenção", aliases: ["proxima_manutencao", "prox manutencao", "próx. manutenção", "manutencao", "manutenção"], type: "date", example: "2026-12-01" },
      { key: "descricao", header: "Descrição", aliases: ["descricao", "descrição", "obs"], type: "text", example: "Bosch 750W" },
    ],
  },
  ativos: {
    kind: "ativos",
    table: "ativos",
    label: "Ativos",
    matchKeys: ["codigo", "nome"],
    columns: [
      { key: "nome", header: "Nome", aliases: ["nome"], required: true, type: "text", example: "Betoneira 400L" },
      { key: "codigo", header: "Código", aliases: ["codigo", "cod", "patrimonio"], type: "text", example: "AT-001" },
      { key: "categoria", header: "Categoria", aliases: ["categoria"], type: "text", example: "Equipamento" },
      {
        key: "estado",
        header: "Estado",
        aliases: ["estado", "status", "situacao"],
        type: "enum",
        options: ["em_uso", "estoque", "manutencao", "baixado"],
        example: "em_uso",
      },
      OBRA_COL,
      { key: "valor", header: "Valor (R$)", aliases: ["valor", "valor r$", "preco", "custo"], type: "number", example: "2500,00" },
      { key: "data_aquisicao", header: "Aquisição", aliases: ["aquisicao", "aquisição", "data_aquisicao", "data aquisicao"], type: "date", example: "2026-01-15" },
      { key: "descricao", header: "Descrição", aliases: ["descricao", "descrição", "obs"], type: "text", example: "Motor 2CV" },
    ],
  },
};

// ---------- normalização ----------

export function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function normHeader(s: string): string {
  return stripAccents(String(s ?? "").trim().toLowerCase()).replace(/\s+/g, " ");
}

export function normText(s: unknown): string {
  return stripAccents(String(s ?? "").trim().toLowerCase());
}

// ---------- parse CSV ----------

export interface ParsedCSV {
  headers: string[];
  rows: string[][];
  delimiter: string;
}

function detectDelimiter(text: string): string {
  const firstLine = (text.split(/\r?\n/).find((l) => l.trim() !== "") ?? "");
  const candidates = [";", ",", "\t", "|"];
  let best = ";";
  let bestCount = -1;
  for (const d of candidates) {
    const count = firstLine.split(d).length - 1;
    if (count > bestCount) {
      bestCount = count;
      best = d;
    }
  }
  return bestCount <= 0 ? ";" : best;
}

function splitLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

export function parseCSVText(raw: string): ParsedCSV {
  const text = String(raw ?? "").replace(/^﻿/, "").replace(/^\uFEFF/, "");
  if (!text.trim()) return { headers: [], rows: [], delimiter: ";" };
  const delimiter = detectDelimiter(text);
  const lines = text.split(/\r?\n/);
  // remove linhas totalmente vazias no fim, mantém linhas do meio
  const nonEmpty = lines.filter((l, idx) => {
    if (idx === 0) return true;
    return l.trim() !== "";
  });
  const headers = splitLine(nonEmpty[0].replace(/^﻿/, ""), delimiter).map((h) =>
    h.replace(/^"|"$/g, "").trim(),
  );
  const rows = nonEmpty.slice(1).map((l) => {
    const cells = splitLine(l, delimiter).map((c) => c.replace(/^"|"$/g, "").trim());
    while (cells.length < headers.length) cells.push("");
    return cells.slice(0, headers.length);
  });
  return { headers, rows, delimiter };
}

// ---------- números / datas pt-BR ----------

export function parseNumberBR(raw: unknown, delimiter = ";"): number | null {
  if (raw == null || String(raw).trim() === "") return null;
  let s = String(raw).trim().replace(/\s+/g, "").replace(/^R\$\s?/i, "");
  if (delimiter === ";") {
    // pt-BR: milhar "." e decimal ","
    if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
    else if (s.includes(",")) s = s.replace(",", ".");
  } else {
    // delimitador "," ou TAB: remove separador de milhar
    if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(String(raw).trim())) s = s.replace(/\./g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN as unknown as number; // NaN sinaliza inválido
}

export function parseDateBR(raw: unknown): string | null {
  if (raw == null || String(raw).trim() === "") return null;
  const s = String(raw).trim().slice(0, 10);
  // já ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(s + "T12:00:00");
    return Number.isNaN(d.getTime()) ? ("INVALID" as unknown as string) : s;
  }
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    let [, dd, mm, yyyy] = m;
    if (yyyy.length === 2) yyyy = "20" + yyyy;
    const iso = `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
    const d = new Date(iso + "T12:00:00");
    return Number.isNaN(d.getTime()) ? ("INVALID" as unknown as string) : iso;
  }
  return "INVALID" as unknown as string;
}

// ---------- validação linha a linha ----------

export interface ImportRowResult {
  line: number; // 2-based (1 = cabeçalho)
  data: Record<string, string>; // valores crus por key oficial
  payload: Record<string, unknown> | null; // pronto p/ Supabase (sem obra_nome)
  obraNomeRaw: string;
  errors: string[];
}

export function mapParsedToRows(
  schema: InventorySchema,
  parsed: ParsedCSV,
): { mapped: ImportRowResult[]; missingHeaders: string[]; colIndex: Map<string, number> } {
  const colIndex = new Map<string, number>();
  const normHeaders = parsed.headers.map(normHeader);
  schema.columns.forEach((col) => {
    const candidates = [normHeader(col.header), ...col.aliases.map(normHeader)];
    const idx = normHeaders.findIndex((h) => candidates.includes(h));
    if (idx >= 0) colIndex.set(col.key, idx);
  });
  const missingHeaders = schema.columns
    .filter((c) => c.required && !colIndex.has(c.key))
    .map((c) => c.header);

  const mapped: ImportRowResult[] = parsed.rows.map((cells, i) => {
    const line = i + 2;
    const data: Record<string, string> = {};
    const errors: string[] = [];
    const payload: Record<string, unknown> = {};
    let obraNomeRaw = "";

    for (const col of schema.columns) {
      const idx = colIndex.get(col.key);
      const raw = idx == null ? "" : (cells[idx] ?? "");
      data[col.key] = raw;
      if (col.key === "obra_nome") {
        obraNomeRaw = raw;
        continue;
      }
      const v = raw.trim();
      if (col.required && !v) {
        errors.push(`${col.header} é obrigatório`);
        continue;
      }
      if (!v) continue;
      if (col.type === "number") {
        const n = parseNumberBR(v, parsed.delimiter);
        if (n == null || Number.isNaN(n as number)) errors.push(`${col.header}: número inválido ("${v}")`);
        else payload[col.key] = n;
      } else if (col.type === "date") {
        const d = parseDateBR(v);
        if (d === "INVALID") errors.push(`${col.header}: data inválida ("${v}") — use AAAA-MM-DD ou DD/MM/AAAA`);
        else if (d) payload[col.key] = d;
      } else if (col.type === "enum" && col.options) {
        const nv = normText(v).replace(/\s+/g, "_");
        const match = col.options.find((o) => normText(o) === nv);
        if (!match) errors.push(`${col.header}: valor inválido ("${v}") — use: ${col.options.join(", ")}`);
        else payload[col.key] = match;
      } else {
        payload[col.key] = v;
      }
    }
    return { line, data, payload: errors.length ? null : payload, obraNomeRaw, errors };
  });

  return { mapped, missingHeaders, colIndex };
}

export function resolveObraId(obraNomeRaw: string, obras: ObraRef[]): { obra_id: string | null; error?: string } {
  const s = String(obraNomeRaw ?? "").trim();
  if (!s || normText(s) === "geral" || normText(s) === "sem obra" || s === "—" || s === "-") {
    return { obra_id: null };
  }
  const found = obras.find((o) => normText(o.nome) === normText(s));
  if (found) return { obra_id: found.id };
  return { obra_id: null, error: `Obra "${s}" não encontrada no sistema` };
}

// ---------- geração de CSV (modelo + exportação) ----------

function escCSV(v: unknown): string {
  const s = String(v ?? "");
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildCSV(headers: string[], rows: (string | number | null | undefined)[][]): string {
  return ["﻿" + headers.map(escCSV).join(";"), ...rows.map((r) => r.map(escCSV).join(";"))].join("\r\n");
}

export function downloadCSV(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  const csv = buildCSV(headers, rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function templateHeaders(kind: InventoryKind): string[] {
  return INVENTORY_SCHEMAS[kind].columns.map((c) => c.header);
}

export function templateExampleRow(kind: InventoryKind): string[] {
  return INVENTORY_SCHEMAS[kind].columns.map((c) => c.example ?? "");
}

export function downloadTemplate(kind: InventoryKind) {
  const schema = INVENTORY_SCHEMAS[kind];
  const date = new Date().toISOString().slice(0, 10);
  downloadCSV(`modelo-importacao-${kind}-${date}`, templateHeaders(kind), [
    templateExampleRow(kind),
    // segunda linha de exemplo ajuda quem abre no Excel; o import ignora? não ignora —
    // por isso deixamos só 1 linha de exemplo e o usuário apaga/substitui.
  ]);
  return schema;
}
