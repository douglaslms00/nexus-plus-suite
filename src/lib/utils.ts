import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { parseISO as _parseISO, format as _format } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number | string | null | undefined): string {
  const num = typeof value === "number" ? value : Number(value || 0);
  if (isNaN(num)) return "R$ 0,00";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(num);
}

export function formatDateBR(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return "—";
  try {
    const d = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
    if (isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat("pt-BR").format(d);
  } catch {
    return "—";
  }
}

/**
 * Safe wrapper for date-fns parseISO.
 * Handles null, undefined, Date objects, and non-string values
 * that would otherwise crash with "dateString.split is not a function".
 */
export function safeParseISO(value: string | Date | null | undefined): Date {
  if (!value) return new Date(NaN);
  if (value instanceof Date) return value;
  if (typeof value === "string") return _parseISO(value);
  // If it's a number or other type, try to convert
  try {
    return new Date(Number(value));
  } catch {
    return new Date(NaN);
  }
}

/**
 * Safe wrapper for date-fns format.
 * Returns fallback string if the date is invalid.
 */
export function safeFormatDate(
  value: string | Date | null | undefined,
  formatStr: string,
  fallback: string = "—",
): string {
  try {
    const d = typeof value === "string" ? _parseISO(value) : value;
    if (!d || isNaN(d.getTime())) return fallback;
    return _format(d, formatStr);
  } catch {
    return fallback;
  }
}
