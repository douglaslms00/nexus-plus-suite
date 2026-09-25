import { supabase } from "@/integrations/supabase/client";

export const COMPROMISSOS_MIGRATION_HINT =
  "Tabela 'compromissos' não encontrada — aplique a migration 20260930_compromissos no Supabase.";

export type Compromisso = {
  id: string;
  user_id: string;
  titulo: string;
  descricao: string | null;
  /** Data no formato YYYY-MM-DD */
  data: string;
  hora_inicio: string | null;
  hora_fim: string | null;
  tarefa_id: string | null;
  concluido: boolean;
  created_at: string;
  updated_at: string;
};

export type CompromissoInput = {
  titulo: string;
  descricao?: string;
  /** YYYY-MM-DD */
  data: string;
  hora_inicio?: string;
  hora_fim?: string;
  tarefa_id?: string | null;
};

function isMissingTable(error: any): boolean {
  if (!error) return false;
  return (
    (error as any)?.code === "PGRST205" ||
    /compromissos/i.test((error as any)?.message ?? "")
  );
}

async function getUserId(): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");
  return user.id;
}

/** Lista os compromissos do usuário logado (mais recentes primeiro por data). */
export async function listarMeusCompromissos(): Promise<Compromisso[]> {
  const uid = await getUserId();
  const { data, error } = await (supabase as any)
    .from("compromissos")
    .select("*")
    .eq("user_id", uid)
    .order("data", { ascending: true })
    .order("hora_inicio", { ascending: true, nullsFirst: true })
    .limit(2000);
  if (error) throw error;
  return (data ?? []) as Compromisso[];
}

export async function criarCompromisso(input: CompromissoInput): Promise<Compromisso> {
  const uid = await getUserId();
  const titulo = input.titulo.trim();
  if (titulo.length < 2) throw new Error("Informe o título do compromisso");
  if (!input.data) throw new Error("Informe a data do compromisso");
  if (input.hora_inicio && input.hora_fim && input.hora_fim < input.hora_inicio) {
    throw new Error("Hora de término anterior ao início");
  }
  const { data, error } = await (supabase as any)
    .from("compromissos")
    .insert({
      user_id: uid,
      titulo,
      descricao: input.descricao?.trim() || null,
      data: input.data,
      hora_inicio: input.hora_inicio || null,
      hora_fim: input.hora_fim || null,
      tarefa_id: input.tarefa_id || null,
    })
    .select()
    .single();
  if (error) {
    if (isMissingTable(error)) throw new Error(COMPROMISSOS_MIGRATION_HINT);
    throw error;
  }
  return data as Compromisso;
}

export async function atualizarCompromisso(
  id: string,
  input: Partial<CompromissoInput> & { concluido?: boolean },
): Promise<void> {
  const patch: any = {};
  if (input.titulo !== undefined) {
    const titulo = input.titulo.trim();
    if (titulo.length < 2) throw new Error("Informe o título do compromisso");
    patch.titulo = titulo;
  }
  if (input.descricao !== undefined) patch.descricao = input.descricao?.trim() || null;
  if (input.data !== undefined) {
    if (!input.data) throw new Error("Informe a data do compromisso");
    patch.data = input.data;
  }
  if (input.hora_inicio !== undefined) patch.hora_inicio = input.hora_inicio || null;
  if (input.hora_fim !== undefined) patch.hora_fim = input.hora_fim || null;
  if (input.tarefa_id !== undefined) patch.tarefa_id = input.tarefa_id || null;
  if (input.concluido !== undefined) patch.concluido = input.concluido;
  const { error } = await (supabase as any).from("compromissos").update(patch).eq("id", id);
  if (error) {
    if (isMissingTable(error)) throw new Error(COMPROMISSOS_MIGRATION_HINT);
    throw error;
  }
}

export async function excluirCompromisso(id: string): Promise<void> {
  const { error } = await (supabase as any).from("compromissos").delete().eq("id", id);
  if (error) {
    if (isMissingTable(error)) throw new Error(COMPROMISSOS_MIGRATION_HINT);
    throw error;
  }
}

/** Formata "14:00 - 15:30", "14:00" ou "Dia todo". */
export function formatarHorario(c: Pick<Compromisso, "hora_inicio" | "hora_fim">): string {
  const ini = (c.hora_inicio ?? "").slice(0, 5);
  const fim = (c.hora_fim ?? "").slice(0, 5);
  if (ini && fim) return `${ini} – ${fim}`;
  if (ini) return ini;
  return "Dia todo";
}
