DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['frota_veiculos','frota_motoristas','frota_manutencoes','frota_pedagios','frota_termos'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS allow_all_authenticated ON public.%I', t);
    EXECUTE format('CREATE POLICY frota_select ON public.%I FOR SELECT TO authenticated USING (public.can_module(auth.uid(),''frota'',''view''))', t);
    EXECUTE format('CREATE POLICY frota_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (public.can_module(auth.uid(),''frota'',''edit''))', t);
    EXECUTE format('CREATE POLICY frota_update ON public.%I FOR UPDATE TO authenticated USING (public.can_module(auth.uid(),''frota'',''edit'')) WITH CHECK (public.can_module(auth.uid(),''frota'',''edit''))', t);
    EXECUTE format('CREATE POLICY frota_delete ON public.%I FOR DELETE TO authenticated USING (public.can_module(auth.uid(),''frota'',''delete''))', t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS allow_all_authenticated ON public.ferramenta_transferencias;
CREATE POLICY ft_select ON public.ferramenta_transferencias FOR SELECT TO authenticated USING (public.can_module(auth.uid(),'ferramentas','view'));
CREATE POLICY ft_insert ON public.ferramenta_transferencias FOR INSERT TO authenticated WITH CHECK (public.can_module(auth.uid(),'ferramentas','edit'));
CREATE POLICY ft_update ON public.ferramenta_transferencias FOR UPDATE TO authenticated USING (public.can_module(auth.uid(),'ferramentas','edit')) WITH CHECK (public.can_module(auth.uid(),'ferramentas','edit'));
CREATE POLICY ft_delete ON public.ferramenta_transferencias FOR DELETE TO authenticated USING (public.can_module(auth.uid(),'ferramentas','delete'));

DROP POLICY IF EXISTS epis_select_authenticated ON public.epis;
CREATE POLICY epis_sel ON public.epis FOR SELECT TO authenticated USING (public.can_module(auth.uid(),'epis','view'));
DROP POLICY IF EXISTS mat_sel ON public.materiais;
CREATE POLICY mat_sel ON public.materiais FOR SELECT TO authenticated USING (public.can_module(auth.uid(),'materiais','view'));
DROP POLICY IF EXISTS obra_venc_select ON public.obra_vencimentos;
CREATE POLICY obra_venc_select ON public.obra_vencimentos FOR SELECT TO authenticated USING (public.can_module(auth.uid(),'obras','view'));

DROP POLICY IF EXISTS "Authenticated can read custom roles" ON public.custom_roles;
CREATE POLICY "Read own or managed custom roles" ON public.custom_roles FOR SELECT TO authenticated
  USING (public.is_admin_or_gestor(auth.uid()) OR EXISTS (SELECT 1 FROM public.user_custom_roles u WHERE u.user_id = auth.uid() AND u.custom_role_id = custom_roles.id));
DROP POLICY IF EXISTS "Authenticated can read custom role perms" ON public.custom_role_module_permissions;
CREATE POLICY "Read own or managed custom role perms" ON public.custom_role_module_permissions FOR SELECT TO authenticated
  USING (public.is_admin_or_gestor(auth.uid()) OR EXISTS (SELECT 1 FROM public.user_custom_roles u WHERE u.user_id = auth.uid() AND u.custom_role_id = custom_role_module_permissions.custom_role_id));
DROP POLICY IF EXISTS srmp_sel ON public.system_role_module_permissions;
CREATE POLICY srmp_sel ON public.system_role_module_permissions FOR SELECT TO authenticated
  USING (public.is_admin_or_gestor(auth.uid()) OR public.has_role(auth.uid(), role));
DROP POLICY IF EXISTS system_role_labels_select ON public.system_role_labels;
CREATE POLICY system_role_labels_select ON public.system_role_labels FOR SELECT TO authenticated
  USING (public.is_admin_or_gestor(auth.uid()) OR public.has_role(auth.uid(), role));

DROP POLICY IF EXISTS docs_pessoais_select ON storage.objects;
CREATE POLICY docs_pessoais_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'anexos' AND owner_id = (select auth.uid())::text AND name LIKE 'documentos/pessoal/' || auth.uid()::text || '/%');
DROP POLICY IF EXISTS docs_pessoais_write ON storage.objects;
CREATE POLICY docs_pessoais_write ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'anexos' AND owner_id = (select auth.uid())::text AND name LIKE 'documentos/pessoal/' || auth.uid()::text || '/%')
  WITH CHECK (bucket_id = 'anexos' AND owner_id = (select auth.uid())::text AND name LIKE 'documentos/pessoal/' || auth.uid()::text || '/%');
DROP POLICY IF EXISTS avatars_self ON storage.objects;
CREATE POLICY avatars_self ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'anexos' AND owner_id = (select auth.uid())::text AND name LIKE 'avatars/' || auth.uid()::text || '/%')
  WITH CHECK (bucket_id = 'anexos' AND owner_id = (select auth.uid())::text AND name LIKE 'avatars/' || auth.uid()::text || '/%');
DROP POLICY IF EXISTS anexos_upload_p2p ON storage.objects;
CREATE POLICY anexos_upload_p2p ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'anexos' AND owner_id = (select auth.uid())::text AND name LIKE 'tarefas-solicitacoes/%');