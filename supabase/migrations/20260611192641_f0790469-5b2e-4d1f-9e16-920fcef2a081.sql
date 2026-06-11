
DROP POLICY IF EXISTS ativos_sel ON public.ativos;
CREATE POLICY ativos_sel ON public.ativos FOR SELECT TO authenticated
  USING (public.has_obra_access(auth.uid(), obra_id) AND (obra_id IS NOT NULL OR public.is_admin_or_gestor(auth.uid())));

DROP POLICY IF EXISTS fer_sel ON public.ferramentas;
CREATE POLICY fer_sel ON public.ferramentas FOR SELECT TO authenticated
  USING (public.has_obra_access(auth.uid(), obra_id) AND (obra_id IS NOT NULL OR public.is_admin_or_gestor(auth.uid())));

DROP POLICY IF EXISTS mm_sel ON public.material_movimentos;
CREATE POLICY mm_sel ON public.material_movimentos FOR SELECT TO authenticated
  USING (public.has_obra_access(auth.uid(), obra_id) AND (obra_id IS NOT NULL OR public.is_admin_or_gestor(auth.uid())));

DROP POLICY IF EXISTS "Ver documentos por obra" ON public.funcionario_documentos;
CREATE POLICY "Ver documentos por obra" ON public.funcionario_documentos FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.funcionarios f
    WHERE f.id = funcionario_documentos.funcionario_id
      AND (
        (f.obra_id IS NOT NULL AND public.has_obra_access(auth.uid(), f.obra_id))
        OR (f.obra_id IS NULL AND public.is_admin_or_gestor(auth.uid()))
      )
  ));

DROP POLICY IF EXISTS "Funcionarios anexos - ler" ON storage.objects;
CREATE POLICY "Funcionarios anexos - ler" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'anexos'
    AND (storage.foldername(name))[1] = 'funcionarios'
    AND public.is_admin_or_gestor(auth.uid())
  );
