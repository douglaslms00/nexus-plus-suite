-- Fix 1: contas_financeiras select — block NULL-obra leak via has_obra_access short-circuit
DROP POLICY IF EXISTS contas_select ON public.contas_financeiras;
CREATE POLICY contas_select ON public.contas_financeiras
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'gestor')
  OR (escopo = 'pessoal' AND user_id = auth.uid())
  OR (escopo = 'obra' AND obra_id IS NOT NULL AND public.has_obra_access(auth.uid(), obra_id))
  OR (user_id = auth.uid())
  OR (created_by = auth.uid())
);

-- Fix 2: funcionarios select — block NULL-obra leak
DROP POLICY IF EXISTS funcionarios_sel ON public.funcionarios;
CREATE POLICY funcionarios_sel ON public.funcionarios
FOR SELECT TO authenticated
USING (
  public.is_admin_or_gestor(auth.uid())
  OR (obra_id IS NOT NULL AND public.has_obra_access(auth.uid(), obra_id))
);

-- Fix 3: storage docs/obra — restrict to users with obra access via documentos join
DROP POLICY IF EXISTS docs_obra_select ON storage.objects;
DROP POLICY IF EXISTS docs_obra_write ON storage.objects;

CREATE POLICY docs_obra_select ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'anexos'
  AND name LIKE 'documentos/obra/%'
  AND EXISTS (
    SELECT 1 FROM public.documentos d
    WHERE d.storage_path = storage.objects.name
      AND d.escopo = 'obra'
      AND d.obra_id IS NOT NULL
      AND public.has_obra_access(auth.uid(), d.obra_id)
  )
);

CREATE POLICY docs_obra_write ON storage.objects
FOR ALL TO authenticated
USING (
  bucket_id = 'anexos'
  AND name LIKE 'documentos/obra/%'
  AND (
    public.is_admin_or_gestor(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.documentos d
      WHERE d.storage_path = storage.objects.name
        AND d.escopo = 'obra'
        AND d.obra_id IS NOT NULL
        AND public.has_obra_access(auth.uid(), d.obra_id)
    )
  )
)
WITH CHECK (
  bucket_id = 'anexos'
  AND name LIKE 'documentos/obra/%'
  AND public.is_admin_or_gestor(auth.uid())
);