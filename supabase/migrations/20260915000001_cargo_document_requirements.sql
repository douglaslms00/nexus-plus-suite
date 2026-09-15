-- Obrigatoriedade de documentos por cargo/função.
-- Cada linha diz qual documento é exigido de qual público:
--   * cargo_ref ('sys:gestor', 'cus:<uuid>') => exigido dos USUÁRIOS com esse cargo;
--   * funcao (texto livre, ex.: 'Pedreiro')   => exigido dos FUNCIONÁRIOS com essa função.
-- Pelo menos um dos dois deve estar preenchido. Seguro para aplicar múltiplas vezes.

CREATE TABLE IF NOT EXISTS public.cargo_document_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cargo_ref text,
  funcao text,
  documento_nome text NOT NULL,
  descricao text,
  validade_meses integer,
  obrigatorio boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cargo_doc_req_alvo_check CHECK (cargo_ref IS NOT NULL OR funcao IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_cargo_doc_req_cargo ON public.cargo_document_requirements (cargo_ref);
CREATE INDEX IF NOT EXISTS idx_cargo_doc_req_funcao ON public.cargo_document_requirements (funcao);

ALTER TABLE public.cargo_document_requirements ENABLE ROW LEVEL SECURITY;

-- Leitura: qualquer usuário autenticado (cada um vê o que lhe é exigido).
DROP POLICY IF EXISTS "cargo_doc_req_select" ON public.cargo_document_requirements;
CREATE POLICY "cargo_doc_req_select" ON public.cargo_document_requirements
  FOR SELECT TO authenticated USING (true);

-- Escrita: apenas admin/gestor.
DROP POLICY IF EXISTS "cargo_doc_req_write" ON public.cargo_document_requirements;
CREATE POLICY "cargo_doc_req_write" ON public.cargo_document_requirements
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles r
      WHERE r.user_id = auth.uid() AND r.role IN ('admin', 'gestor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles r
      WHERE r.user_id = auth.uid() AND r.role IN ('admin', 'gestor')
    )
  );
