import { supabase } from "@/integrations/supabase/client";
import { assertFileSizeOk } from "@/lib/upload";

export const SOLICITACAO_TTL_HOURS = 48;
export const SOLICITACAO_STORAGE_PREFIX = "tarefas-solicitacoes";
export const SIGNED_URL_TTL_SECONDS = 3600;

export type SolicitacaoStatus = "pendente" | "enviada" | "excluida" | "cancelada";

export type TarefaSolicitacao = {
  id: string;
  tarefa_id: string | null;
  solicitante_id: string;
  remetente_id: string;
  nome_arquivo_esperado: string;
  descricao: string | null;
  status: SolicitacaoStatus;
  created_at: string;
  updated_at: string;
};

export type ArquivoEnviado = {
  id: string;
  solicitacao_id: string;
  storage_path: string;
  nome_original: string;
  mime_type: string | null;
  tamanho_bytes: number;
  enviado_em: string;
  expira_em: string;
  status: "ativo" | "excluido";
  excluido_em: string | null;
  created_by: string | null;
};

export type SolicitacaoComArquivo = TarefaSolicitacao & {
  arquivos_enviados: ArquivoEnviado | null;
};

/** Tempo restante até expirar. Retorna null se já expirado/excluído. */
export function tempoRestanteMs(expiraEm: string | null | undefined): number | null {
  if (!expiraEm) return null;
  const ms = new Date(expiraEm).getTime() - Date.now();
  return ms > 0 ? ms : null;
}

export function formatarTempoRestante(expiraEm: string): string {
  const ms = tempoRestanteMs(expiraEm);
  if (ms === null) return "Expirado";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h >= 24) {
    const d = Math.floor(h / 24);
    return `${d}d ${h % 24}h restantes`;
  }
  return `${h}h ${m}min restantes`;
}

export function isExpirado(a: Pick<ArquivoEnviado, "expira_em" | "status">): boolean {
  if (a.status !== "ativo") return true;
  return new Date(a.expira_em).getTime() <= Date.now();
}

async function getUserId(): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");
  return user.id;
}

/**
 * 1) FLUXO P2P — Usuário A solicita arquivo ao Usuário B.
 * Notificação ao B é criada pelo trigger `trg_notify_tarefa_solic` no banco.
 */
export async function criarSolicitacaoArquivo(input: {
  tarefa_id?: string | null;
  remetente_id: string;
  nome_arquivo_esperado: string;
  descricao?: string;
}): Promise<TarefaSolicitacao> {
  const solicitante_id = await getUserId();
  const nome = input.nome_arquivo_esperado.trim();
  if (nome.length < 2) throw new Error("Informe o nome do arquivo solicitado");
  if (input.remetente_id === solicitante_id)
    throw new Error("Você não pode solicitar um arquivo para si mesmo");

  const { data, error } = await (supabase as any)
    .from("tarefas_solicitacoes")
    .insert({
      tarefa_id: input.tarefa_id ?? null,
      solicitante_id,
      remetente_id: input.remetente_id,
      nome_arquivo_esperado: nome,
      descricao: input.descricao?.trim() || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as TarefaSolicitacao;
}

/** Lista solicitações onde o usuário logado é A ou B. */
export async function listarMinhasSolicitacoes(): Promise<SolicitacaoComArquivo[]> {
  const uid = await getUserId();
  const { data, error } = await (supabase as any)
    .from("tarefas_solicitacoes")
    .select("*, arquivos_enviados(*)")
    .or(`solicitante_id.eq.${uid},remetente_id.eq.${uid}`)
    .order("created_at", { ascending: false });
  if (error) {
    // Banco ainda sem migration aplicada: retorna vazio em vez de quebrar a tela.
    if ((error as any)?.code === "PGRST205" || /tarefas_solicitacoes/i.test((error as any)?.message ?? "")) {
      console.warn("[solicitacoes] tabela ausente — aplique a migration 20260927:", error.message);
      return [];
    }
    throw error;
  }
  return ((data ?? []) as any[]).map((s) => ({
    ...s,
    arquivos_enviados: Array.isArray(s.arquivos_enviados) ? (s.arquivos_enviados[0] ?? null) : (s.arquivos_enviados ?? null),
  }));
}

/**
 * 2) CICLO DE VIDA — Usuário B envia o arquivo (campo de upload dedicado).
 * Só B, só 1x, só com status pendente. `enviado_em/expira_em` (+48h) via trigger.
 */
export async function enviarArquivoSolicitado(
  solicitacaoId: string,
  file: File,
): Promise<ArquivoEnviado> {
  assertFileSizeOk(file);
  const uid = await getUserId();

  const { data: sol, error: e1 } = await (supabase as any)
    .from("tarefas_solicitacoes")
    .select("id, solicitante_id, remetente_id, status")
    .eq("id", solicitacaoId)
    .single();
  if (e1 || !sol) throw new Error("Solicitação não encontrada");
  if (sol.remetente_id !== uid) throw new Error("Apenas o destinatário pode enviar este arquivo");
  if (sol.status !== "pendente") throw new Error("Solicitação já respondida, cancelada ou expirada");

  const ext = (file.name.split(".").pop() || "bin").slice(0, 10);
  const path = `${SOLICITACAO_STORAGE_PREFIX}/${solicitacaoId}/${crypto.randomUUID()}.${ext}`;

  const { error: upErr } = await supabase.storage.from("anexos").upload(path, file, { upsert: false });
  if (upErr) throw upErr;

  const { data: arq, error: e2 } = await (supabase as any)
    .from("arquivos_enviados")
    .insert({
      solicitacao_id: solicitacaoId,
      storage_path: path,
      nome_original: file.name,
      mime_type: file.type || null,
      tamanho_bytes: file.size,
      created_by: uid,
    })
    .select()
    .single();
  if (e2) {
    await supabase.storage.from("anexos").remove([path]);
    throw e2;
  }

  const { error: e3 } = await (supabase as any)
    .from("tarefas_solicitacoes")
    .update({ status: "enviada" })
    .eq("id", solicitacaoId);
  if (e3) throw e3;

  // Notifica A (solicitante). A notificação para B já foi feita pelo trigger no INSERT.
  await (supabase as any).from("notifications").insert({
    user_id: sol.solicitante_id,
    tipo: "arquivo_enviado",
    titulo: "Arquivo recebido",
    mensagem: `Recebido: ${file.name} (expira em 48h)`,
    ref_id: solicitacaoId,
    ref_table: "tarefas_solicitacoes",
    link: "/tarefas?tab=solicitacoes",
  });

  return arq as ArquivoEnviado;
}

/**
 * 3) SEGURANÇA — download só para A ou B, só se ativo e dentro das 48h.
 * Usa Signed URL curta (1h). Mesmo que o purge atrase, o acesso lógico já expirou.
 */
export async function getArquivoUrlSeguro(
  solicitacaoId: string,
): Promise<{ url: string; expira_em: string; nome_original: string }> {
  const uid = await getUserId();

  const { data: sol, error } = await (supabase as any)
    .from("tarefas_solicitacoes")
    .select("solicitante_id, remetente_id, arquivos_enviados(*)")
    .eq("id", solicitacaoId)
    .single();
  if (error || !sol) throw new Error("Solicitação não encontrada");
  if (uid !== sol.solicitante_id && uid !== sol.remetente_id)
    throw new Error("Acesso negado: apenas solicitante e destinatário");

  const arq = (Array.isArray(sol.arquivos_enviados) ? sol.arquivos_enviados[0] : sol.arquivos_enviados) as ArquivoEnviado | null;
  if (!arq || arq.status !== "ativo") throw new Error("Arquivo já excluído");
  if (isExpirado(arq)) throw new Error("Arquivo expirado (48h após o envio)");

  const { data, error: sErr } = await supabase.storage
    .from("anexos")
    .createSignedUrl(arq.storage_path, SIGNED_URL_TTL_SECONDS);
  if (sErr || !data?.signedUrl) throw new Error("Não foi possível gerar o link de download");
  return { url: data.signedUrl, expira_em: arq.expira_em, nome_original: arq.nome_original };
}

/** A pode cancelar enquanto pendente; B não pode cancelar, só enviar. */
export async function cancelarSolicitacao(solicitacaoId: string): Promise<void> {
  const uid = await getUserId();
  const { data: sol } = await (supabase as any)
    .from("tarefas_solicitacoes")
    .select("solicitante_id, status")
    .eq("id", solicitacaoId)
    .single();
  if (!sol) throw new Error("Solicitação não encontrada");
  if (sol.solicitante_id !== uid) throw new Error("Apenas o solicitante pode cancelar");
  if (sol.status !== "pendente") throw new Error("Só é possível cancelar solicitações pendentes");
  const { error } = await (supabase as any)
    .from("tarefas_solicitacoes")
    .update({ status: "cancelada" })
    .eq("id", solicitacaoId);
  if (error) throw error;
}
