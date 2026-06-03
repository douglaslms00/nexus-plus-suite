
DROP POLICY IF EXISTS tarefas_select_authenticated ON public.tarefas;
DROP POLICY IF EXISTS tarefas_select_own_or_gestor ON public.tarefas;
CREATE POLICY tarefas_select_own_or_gestor ON public.tarefas
  FOR SELECT TO authenticated
  USING (
    responsavel_id = auth.uid()
    OR created_by = auth.uid()
    OR is_admin_or_gestor(auth.uid())
  );

ALTER TABLE public.funcionarios
  ADD COLUMN IF NOT EXISTS obra_id uuid REFERENCES public.obras(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS validade_meses_aso integer,
  ADD COLUMN IF NOT EXISTS validade_meses_ficha_epi integer,
  ADD COLUMN IF NOT EXISTS validade_meses_folga_campo integer,
  ADD COLUMN IF NOT EXISTS validade_meses_ferias integer;

CREATE UNIQUE INDEX IF NOT EXISTS ativos_codigo_uidx
  ON public.ativos (codigo) WHERE codigo IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.ativo_emprestimos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ativo_id uuid NOT NULL REFERENCES public.ativos(id) ON DELETE CASCADE,
  funcionario_id uuid REFERENCES public.funcionarios(id) ON DELETE SET NULL,
  data_emprestimo date NOT NULL DEFAULT CURRENT_DATE,
  prevista_devolucao date,
  data_devolucao date,
  anexo_url text,
  observacoes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ativo_emprestimos TO authenticated;
GRANT ALL ON public.ativo_emprestimos TO service_role;
ALTER TABLE public.ativo_emprestimos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ae_sel ON public.ativo_emprestimos;
DROP POLICY IF EXISTS ae_ins ON public.ativo_emprestimos;
DROP POLICY IF EXISTS ae_upd ON public.ativo_emprestimos;
DROP POLICY IF EXISTS ae_del ON public.ativo_emprestimos;
CREATE POLICY ae_sel ON public.ativo_emprestimos FOR SELECT TO authenticated USING (true);
CREATE POLICY ae_ins ON public.ativo_emprestimos FOR INSERT TO authenticated WITH CHECK (is_admin_or_gestor(auth.uid()));
CREATE POLICY ae_upd ON public.ativo_emprestimos FOR UPDATE TO authenticated USING (is_admin_or_gestor(auth.uid()));
CREATE POLICY ae_del ON public.ativo_emprestimos FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));

ALTER TABLE public.epi_movimentos
  ADD COLUMN IF NOT EXISTS motivo_retirada text;

ALTER TABLE public.contas_financeiras
  ADD COLUMN IF NOT EXISTS comprovante_url text;

CREATE OR REPLACE FUNCTION public.admin_delete_user(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Apenas admin pode excluir usuários';
  END IF;
  IF _user_id = auth.uid() THEN
    RAISE EXCEPTION 'Você não pode excluir a si mesmo';
  END IF;
  DELETE FROM public.user_module_permissions WHERE user_id = _user_id;
  DELETE FROM public.user_roles WHERE user_id = _user_id;
  DELETE FROM public.profiles WHERE id = _user_id;
END $$;
REVOKE ALL ON FUNCTION public.admin_delete_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated;
