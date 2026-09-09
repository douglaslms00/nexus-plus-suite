-- Rodar no SQL Editor do NOVO projeto (Lovable Cloud) DEPOIS do NEW_PROJECT_SCHEMA.sql.
-- Libera o bucket anexos para usuários logados (mesmo modelo permissivo do app).
DROP POLICY IF EXISTS "anexos_authenticated_all" ON storage.objects;
CREATE POLICY "anexos_authenticated_all" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'anexos')
  WITH CHECK (bucket_id = 'anexos');
