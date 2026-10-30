DROP POLICY IF EXISTS cargo_doc_req_select ON public.cargo_document_requirements;
CREATE POLICY cargo_doc_req_select ON public.cargo_document_requirements FOR SELECT TO authenticated USING (public.can_module(auth.uid(),'funcionarios','view') OR public.is_admin_or_gestor(auth.uid()));
DO $$ DECLARE t text; BEGIN
FOREACH t IN ARRAY ARRAY['frota_abastecimentos','frota_gastos_avulsos'] LOOP
EXECUTE format('DROP POLICY IF EXISTS allow_all_authenticated ON public.%I',t);
EXECUTE format('CREATE POLICY frota_select ON public.%I FOR SELECT TO authenticated USING (public.can_module(auth.uid(),''frota'',''view''))',t);
EXECUTE format('CREATE POLICY frota_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (public.can_module(auth.uid(),''frota'',''edit''))',t);
EXECUTE format('CREATE POLICY frota_update ON public.%I FOR UPDATE TO authenticated USING (public.can_module(auth.uid(),''frota'',''edit'')) WITH CHECK (public.can_module(auth.uid(),''frota'',''edit''))',t);
EXECUTE format('CREATE POLICY frota_delete ON public.%I FOR DELETE TO authenticated USING (public.can_module(auth.uid(),''frota'',''delete''))',t);
END LOOP; END $$;