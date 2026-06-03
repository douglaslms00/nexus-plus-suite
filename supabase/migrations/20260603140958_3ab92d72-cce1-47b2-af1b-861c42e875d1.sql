
CREATE POLICY "anexos_select" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'anexos');
CREATE POLICY "anexos_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'anexos');
CREATE POLICY "anexos_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'anexos');
CREATE POLICY "anexos_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'anexos');
