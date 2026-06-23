
-- Fix contas_financeiras: remove fallback OR clauses leaking obra rows
DROP POLICY IF EXISTS contas_select ON public.contas_financeiras;
CREATE POLICY contas_select ON public.contas_financeiras
FOR SELECT TO authenticated
USING (
  public.is_admin_or_gestor(auth.uid())
  OR (escopo = 'pessoal' AND user_id = auth.uid())
  OR (escopo = 'obra' AND obra_id IS NOT NULL AND public.has_obra_access(auth.uid(), obra_id))
);

-- Remove duplicate DELETE policy; keep admin-only cf_del
DROP POLICY IF EXISTS contas_delete ON public.contas_financeiras;

-- ativos_sel: restructure so admins/gestors see NULL obra_id rows
DROP POLICY IF EXISTS ativos_sel ON public.ativos;
CREATE POLICY ativos_sel ON public.ativos
FOR SELECT TO authenticated
USING (
  public.is_admin_or_gestor(auth.uid())
  OR (obra_id IS NOT NULL AND public.has_obra_access(auth.uid(), obra_id))
);

-- ferramentas fer_sel
DROP POLICY IF EXISTS fer_sel ON public.ferramentas;
CREATE POLICY fer_sel ON public.ferramentas
FOR SELECT TO authenticated
USING (
  public.is_admin_or_gestor(auth.uid())
  OR (obra_id IS NOT NULL AND public.has_obra_access(auth.uid(), obra_id))
);

-- material_movimentos mm_sel
DROP POLICY IF EXISTS mm_sel ON public.material_movimentos;
CREATE POLICY mm_sel ON public.material_movimentos
FOR SELECT TO authenticated
USING (
  public.is_admin_or_gestor(auth.uid())
  OR (obra_id IS NOT NULL AND public.has_obra_access(auth.uid(), obra_id))
);
