/**
 * Consultas PostgREST resilientes.
 *
 * O Supabase retorna HTTP 400 (PGRST204 / 42703 / "schema cache") quando o
 * frontend seleciona uma coluna/tabela que ainda não existe no banco remoto
 * (migration pendente) ou quando um embed FK é inválido. Antes, esses erros
 * faziam `throw` dentro do `queryFn` e o painel travava no carregamento.
 *
 * Estes helpers convertem "tabela/coluna ausente" em lista vazia (com warn
 * no console) para que a tela abra normalmente, em vez de travar.
 */

type SupabaseListResult<T> = { data: T[] | null; error: unknown };

export function isMissingSchemaError(error: unknown): boolean {
  const e = error as { code?: string; message?: string; status?: number } | null;
  if (!e) return false;
  const code = String(e.code ?? "");
  if (["PGRST204", "PGRST205", "PGRST202", "42703", "42883", "42P01"].includes(code)) return true;
  if ((e as { status?: number }).status === 400) return true;
  const msg = String((e as { message?: string }).message ?? e);
  return (
    /schema cache/i.test(msg) ||
    /Could not find the '.*' column/i.test(msg) ||
    /column .* does not exist/i.test(msg) ||
    /relation .* does not exist/i.test(msg) ||
    /table .* (not found|does not exist)/i.test(msg) ||
    /Failed to load/i.test(msg)
  );
}

/** Executa um `select` e retorna `[]` em vez de lançar erro 400/schema ausente. */
export async function safeList<T>(
  run: () => Promise<SupabaseListResult<T>>,
  label = "query",
): Promise<T[]> {
  try {
    const { data, error } = await run();
    if (error) {
      if (isMissingSchemaError(error)) {
        console.warn(
          `[safe-query] ${label}: tabela/coluna ausente no banco (retornando vazio). Aplique as migrations pendentes.`,
          (error as { message?: string })?.message ?? error,
        );
        return [];
      }
      throw error;
    }
    return (data ?? []) as T[];
  } catch (e) {
    if (isMissingSchemaError(e)) {
      console.warn(
        `[safe-query] ${label}: tabela/coluna ausente no banco (retornando vazio).`,
        (e as { message?: string })?.message ?? e,
      );
      return [];
    }
    throw e;
  }
}

/** Opções padrão para queries do painel: 1 retry, sem throw global. */
export const PANEL_QUERY_DEFAULTS = {
  retry: 1,
  refetchOnWindowFocus: false,
} as const;
