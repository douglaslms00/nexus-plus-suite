
-- Fix ativos_sel: restructure to allow admin/gestor to see NULL obra_id rows
DROP POLICY IF EXISTS ativos_sel ON public.ativos;
CREATE POLICY ativos_sel ON public.ativos FOR SELECT TO authenticated
USING (
  public.is_admin_or_gestor(auth.uid())
  OR (obra_id IS NOT NULL AND public.has_obra_access(auth.uid(), obra_id))
);

-- Fix fer_sel on ferramentas (same broken pattern)
DROP POLICY IF EXISTS fer_sel ON public.ferramentas;
CREATE POLICY fer_sel ON public.ferramentas FOR SELECT TO authenticated
USING (
  public.is_admin_or_gestor(auth.uid())
  OR (obra_id IS NOT NULL AND public.has_obra_access(auth.uid(), obra_id))
);

-- Fix mm_sel on material_movimentos
DROP POLICY IF EXISTS mm_sel ON public.material_movimentos;
CREATE POLICY mm_sel ON public.material_movimentos FOR SELECT TO authenticated
USING (
  public.is_admin_or_gestor(auth.uid())
  OR (obra_id IS NOT NULL AND public.has_obra_access(auth.uid(), obra_id))
);

-- Fix contas_select: remove trailing OR fallbacks that leak obra-scoped rows
DROP POLICY IF EXISTS contas_select ON public.contas_financeiras;
CREATE POLICY contas_select ON public.contas_financeiras FOR SELECT TO authenticated
USING (
  (escopo = 'pessoal' AND user_id = auth.uid())
  OR (escopo = 'obra' AND obra_id IS NOT NULL AND public.has_obra_access(auth.uid(), obra_id))
);

-- Fix storage funcionarios read policy: require obra access via funcionario record
DROP POLICY IF EXISTS "Funcionarios anexos - ler" ON storage.objects;
CREATE POLICY "Funcionarios anexos - ler" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'anexos'
  AND (storage.foldername(name))[1] = 'funcionarios'
  AND EXISTS (
    SELECT 1 FROM public.funcionarios f
    WHERE f.id::text = (storage.foldername(name))[2]
      AND (
        public.is_admin_or_gestor(auth.uid())
        OR (f.obra_id IS NOT NULL AND public.has_obra_access(auth.uid(), f.obra_id))
      )
  )
);
