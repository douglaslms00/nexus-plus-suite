
-- ativo_emprestimos
DROP POLICY IF EXISTS ae_sel ON public.ativo_emprestimos;
CREATE POLICY ae_sel ON public.ativo_emprestimos FOR SELECT
USING (
  public.is_admin_or_gestor(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.ativos a
    WHERE a.id = ativo_emprestimos.ativo_id
      AND a.obra_id IS NOT NULL
      AND public.has_obra_access(auth.uid(), a.obra_id)
  )
);

-- ativo_manutencoes
DROP POLICY IF EXISTS am_sel ON public.ativo_manutencoes;
CREATE POLICY am_sel ON public.ativo_manutencoes FOR SELECT
USING (
  public.is_admin_or_gestor(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.ativos a
    WHERE a.id = ativo_manutencoes.ativo_id
      AND a.obra_id IS NOT NULL
      AND public.has_obra_access(auth.uid(), a.obra_id)
  )
);

-- ativo_transferencias
DROP POLICY IF EXISTS at_sel ON public.ativo_transferencias;
CREATE POLICY at_sel ON public.ativo_transferencias FOR SELECT
USING (
  public.is_admin_or_gestor(auth.uid())
  OR (obra_origem_id IS NOT NULL AND public.has_obra_access(auth.uid(), obra_origem_id))
  OR (obra_destino_id IS NOT NULL AND public.has_obra_access(auth.uid(), obra_destino_id))
);

-- ferramenta_emprestimos
DROP POLICY IF EXISTS fe_sel ON public.ferramenta_emprestimos;
CREATE POLICY fe_sel ON public.ferramenta_emprestimos FOR SELECT
USING (
  public.is_admin_or_gestor(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.ferramentas f
    WHERE f.id = ferramenta_emprestimos.ferramenta_id
      AND f.obra_id IS NOT NULL
      AND public.has_obra_access(auth.uid(), f.obra_id)
  )
);

-- epi_movimentos
DROP POLICY IF EXISTS epi_mov_select_authenticated ON public.epi_movimentos;
CREATE POLICY epi_mov_select_scoped ON public.epi_movimentos FOR SELECT
USING (
  public.is_admin_or_gestor(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.funcionarios fu
    WHERE fu.id = epi_movimentos.funcionario_id
      AND fu.obra_id IS NOT NULL
      AND public.has_obra_access(auth.uid(), fu.obra_id)
  )
);

-- contas_financeiras: drop the broad legacy policy, keep only contas_select
DROP POLICY IF EXISTS cf_sel ON public.contas_financeiras;
