
DROP POLICY IF EXISTS docs_select ON public.documentos;
DROP POLICY IF EXISTS docs_insert ON public.documentos;
DROP POLICY IF EXISTS docs_update ON public.documentos;
DROP POLICY IF EXISTS docs_delete ON public.documentos;

CREATE POLICY docs_select ON public.documentos FOR SELECT TO authenticated
USING ((escopo = 'pessoal' AND user_id = auth.uid()) OR (escopo = 'obra' AND public.is_admin_or_gestor(auth.uid())));

CREATE POLICY docs_insert ON public.documentos FOR INSERT TO authenticated
WITH CHECK ((escopo = 'pessoal' AND user_id = auth.uid() AND created_by = auth.uid()) OR (escopo = 'obra' AND public.is_admin_or_gestor(auth.uid())));

CREATE POLICY docs_update ON public.documentos FOR UPDATE TO authenticated
USING ((escopo = 'pessoal' AND user_id = auth.uid()) OR (escopo = 'obra' AND public.is_admin_or_gestor(auth.uid())))
WITH CHECK ((escopo = 'pessoal' AND user_id = auth.uid()) OR (escopo = 'obra' AND public.is_admin_or_gestor(auth.uid())));

CREATE POLICY docs_delete ON public.documentos FOR DELETE TO authenticated
USING ((escopo = 'pessoal' AND user_id = auth.uid()) OR (escopo = 'obra' AND public.is_admin_or_gestor(auth.uid())));

DROP POLICY IF EXISTS pastas_select ON public.documento_pastas;
DROP POLICY IF EXISTS pastas_insert ON public.documento_pastas;
DROP POLICY IF EXISTS pastas_update ON public.documento_pastas;
DROP POLICY IF EXISTS pastas_delete ON public.documento_pastas;

CREATE POLICY pastas_select ON public.documento_pastas FOR SELECT TO authenticated
USING ((escopo = 'pessoal' AND user_id = auth.uid()) OR (escopo = 'obra' AND public.is_admin_or_gestor(auth.uid())));

CREATE POLICY pastas_insert ON public.documento_pastas FOR INSERT TO authenticated
WITH CHECK ((escopo = 'pessoal' AND user_id = auth.uid() AND created_by = auth.uid()) OR (escopo = 'obra' AND public.is_admin_or_gestor(auth.uid())));

CREATE POLICY pastas_update ON public.documento_pastas FOR UPDATE TO authenticated
USING ((escopo = 'pessoal' AND user_id = auth.uid()) OR (escopo = 'obra' AND public.is_admin_or_gestor(auth.uid())))
WITH CHECK ((escopo = 'pessoal' AND user_id = auth.uid()) OR (escopo = 'obra' AND public.is_admin_or_gestor(auth.uid())));

CREATE POLICY pastas_delete ON public.documento_pastas FOR DELETE TO authenticated
USING ((escopo = 'pessoal' AND user_id = auth.uid()) OR (escopo = 'obra' AND public.is_admin_or_gestor(auth.uid())));

DROP POLICY IF EXISTS anexos_docs_obra_read ON storage.objects;
DROP POLICY IF EXISTS anexos_docs_obra_write ON storage.objects;
DROP POLICY IF EXISTS anexos_docs_obra_update ON storage.objects;
DROP POLICY IF EXISTS anexos_docs_obra_delete ON storage.objects;

CREATE POLICY anexos_docs_obra_read ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'anexos' AND name LIKE 'documentos/obra/%' AND public.is_admin_or_gestor(auth.uid()));

CREATE POLICY anexos_docs_obra_write ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'anexos' AND name LIKE 'documentos/obra/%' AND public.is_admin_or_gestor(auth.uid()));

CREATE POLICY anexos_docs_obra_update ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'anexos' AND name LIKE 'documentos/obra/%' AND public.is_admin_or_gestor(auth.uid()))
WITH CHECK (bucket_id = 'anexos' AND name LIKE 'documentos/obra/%' AND public.is_admin_or_gestor(auth.uid()));

CREATE POLICY anexos_docs_obra_delete ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'anexos' AND name LIKE 'documentos/obra/%' AND public.is_admin_or_gestor(auth.uid()));
