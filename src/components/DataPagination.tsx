import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/utils";

export const PAGE_SIZE_OPTIONS = [10, 30, 50] as const;

function loadSavedPageSize(key?: string, fallback = 10): number {
  if (typeof window !== "undefined" && key) {
    const n = Number(window.localStorage.getItem(`pagination-size-${key}`));
    if (PAGE_SIZE_OPTIONS.includes(n as (typeof PAGE_SIZE_OPTIONS)[number])) return n;
  }
  return fallback;
}

export interface UsePaginationOptions {
  /** chave única para lembrar o tamanho da página (localStorage) */
  key?: string;
  initialPageSize?: number;
  /**
   * assinatura dos filtros (ex.: `${busca}|${status}`). Quando muda,
   * a página volta para 1 automaticamente.
   */
  resetKey?: string;
}

export function usePagination<T>(items: readonly T[], options?: UsePaginationOptions) {
  const { key, initialPageSize = 10, resetKey } = options ?? {};
  const [pageSize, setPageSizeState] = useState<number>(() =>
    loadSavedPageSize(key, initialPageSize),
  );
  const [page, setPage] = useState(1);

  // Volta para a primeira página quando os filtros mudam.
  useEffect(() => {
    setPage(1);
  }, [resetKey]);

  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const paged = useMemo(
    () => items.slice((page - 1) * pageSize, page * pageSize),
    [items, page, pageSize],
  );

  const setPageSize = (n: number) => {
    setPageSizeState(n);
    setPage(1);
    if (typeof window !== "undefined" && key) {
      window.localStorage.setItem(`pagination-size-${key}`, String(n));
    }
  };

  return { page, pageSize, total, totalPages, paged, setPage, setPageSize };
}

/** Números de página compactos com reticências (ex.: 1 … 4 5 6 … 12). */
function pageWindow(page: number, totalPages: number): (number | "…")[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const set = new Set<number>([1, 2, page - 1, page, page + 1, totalPages - 1, totalPages]);
  const nums = [...set].filter((n) => n >= 1 && n <= totalPages).sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  let prev = 0;
  for (const n of nums) {
    if (prev && n - prev > 1) out.push("…");
    out.push(n);
    prev = n;
  }
  return out;
}

export function DataPagination({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
  onPageSizeChange,
  itemLabel = "itens",
  pageSizeKey,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (p: number) => void;
  onPageSizeChange: (n: number) => void;
  itemLabel?: string;
  /** exibe "Página X de Y" + seletor mesmo quando cabe em 1 página */
  pageSizeKey?: string;
}) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  void pageSizeKey;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
      <p className="text-xs text-muted-foreground">
        Mostrando {from}–{to} de {total} {itemLabel}
      </p>

      <div className="flex flex-wrap items-center gap-1.5">
        <label className="text-xs text-muted-foreground flex items-center gap-1.5">
          Por página:
          <Select
            value={String(pageSize)}
            onValueChange={(v) => onPageSizeChange(Number(v))}
          >
            <SelectTrigger className="h-8 w-[76px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="outline"
              className="h-8 w-8"
              disabled={page <= 1}
              onClick={() => onPageChange(1)}
              title="Primeira página"
            >
              <ChevronsLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="outline"
              className="h-8 w-8"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              title="Página anterior"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            {pageWindow(page, totalPages).map((n, i) =>
              n === "…" ? (
                <span key={`e${i}`} className="px-1 text-xs text-muted-foreground">
                  …
                </span>
              ) : (
                <Button
                  key={n}
                  size="sm"
                  variant={n === page ? "default" : "outline"}
                  className={cn("h-8 min-w-8 px-2 text-xs")}
                  onClick={() => onPageChange(n)}
                >
                  {n}
                </Button>
              ),
            )}
            <Button
              size="icon"
              variant="outline"
              className="h-8 w-8"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              title="Próxima página"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="outline"
              className="h-8 w-8"
              disabled={page >= totalPages}
              onClick={() => onPageChange(totalPages)}
              title="Última página"
            >
              <ChevronsRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
