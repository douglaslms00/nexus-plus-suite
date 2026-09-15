import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type DocRequirement = {
  id: string;
  cargo_ref: string | null;
  funcao: string | null;
  documento_nome: string;
  descricao: string | null;
  validade_meses: number | null;
  obrigatorio: boolean;
};

export const DOC_REQ_MIGRATION = "20260915000001_cargo_document_requirements.sql";

/** Normaliza para comparar nomes de documentos/funções (minúsculas, sem acento). */
export function normDoc(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/** Lista todas as exigências (vazio + flag se a tabela ainda não existe). */
export function useDocumentRequirements() {
  const q = useQuery({
    queryKey: ["doc-requirements"],
    staleTime: 1000 * 60 * 2,
    retry: 1,
    queryFn: async (): Promise<DocRequirement[]> => {
      const { data, error } = await (supabase as any)
        .from("cargo_document_requirements")
        .select("id, cargo_ref, funcao, documento_nome, descricao, validade_meses, obrigatorio")
        .order("documento_nome");
      if (error) throw error;
      return (data ?? []) as DocRequirement[];
    },
  });
  const err = q.error as { code?: string; message?: string } | null;
  const tableMissing =
    !!err &&
    (err.code === "PGRST205" ||
      /schema cache|does not exist|relation/i.test(String(err.message ?? "")));
  return { ...q, data: (q.data ?? []) as DocRequirement[], tableMissing };
}

/** Exigências que valem para uma função de funcionário (ex.: "Pedreiro"). */
export function requirementsForFuncao(reqs: DocRequirement[], funcao: string | null | undefined) {
  const f = normDoc(funcao);
  if (!f) return [];
  return reqs.filter((r) => normDoc(r.funcao) === f);
}

/** Exigências que valem para os cargos do usuário logado (refs `sys:*` / `cus:*`). */
export function requirementsForCargos(reqs: DocRequirement[], cargoRefs: string[]) {
  if (cargoRefs.length === 0) return [];
  const set = new Set(cargoRefs);
  return reqs.filter((r) => r.cargo_ref && set.has(r.cargo_ref));
}

/** Considera o documento entregue se houver arquivo com nome parecido. */
export function docEntregue(docs: { nome?: string | null }[], exigido: string): boolean {
  const alvo = normDoc(exigido);
  if (!alvo) return false;
  // Compara por palavras relevantes (>= 4 letras) para tolerar "ASO - João.pdf" etc.
  const palavras = alvo.split(/[^a-z0-9]+/).filter((w) => w.length >= 4);
  const chaves = palavras.length > 0 ? palavras : [alvo];
  return docs.some((d) => {
    const nome = normDoc(d.nome);
    return chaves.some((c) => nome.includes(c));
  });
}
