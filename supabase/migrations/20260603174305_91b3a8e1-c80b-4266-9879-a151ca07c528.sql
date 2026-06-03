
DROP POLICY IF EXISTS anexos_select ON storage.objects;
DROP POLICY IF EXISTS anexos_insert ON storage.objects;
DROP POLICY IF EXISTS anexos_update ON storage.objects;
DROP POLICY IF EXISTS anexos_delete ON storage.objects;

CREATE POLICY anexos_select ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'anexos'
  AND (owner = auth.uid() OR public.is_admin_or_gestor(auth.uid()))
);

CREATE POLICY anexos_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'anexos'
  AND owner = auth.uid()
);

CREATE POLICY anexos_update ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'anexos'
  AND (owner = auth.uid() OR public.is_admin_or_gestor(auth.uid()))
)
WITH CHECK (
  bucket_id = 'anexos'
  AND (owner = auth.uid() OR public.is_admin_or_gestor(auth.uid()))
);

CREATE POLICY anexos_delete ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'anexos'
  AND (owner = auth.uid() OR public.is_admin_or_gestor(auth.uid()))
);
