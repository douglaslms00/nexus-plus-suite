
-- 1. Função central de permissão por módulo
CREATE OR REPLACE FUNCTION public.can_module(_user_id uuid, _module text, _action text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_view boolean; v_edit boolean; v_delete boolean; v_found boolean := false;
BEGIN
  IF _user_id IS NULL THEN RETURN false; END IF;
  IF public.has_role(_user_id, 'admin') THEN RETURN true; END IF;

  SELECT can_view, can_edit, can_delete, true INTO v_view, v_edit, v_delete, v_found
  FROM public.user_module_permissions WHERE user_id = _user_id AND module = _module LIMIT 1;

  IF NOT v_found THEN
    SELECT bool_or(p.can_view), bool_or(p.can_edit), bool_or(p.can_delete)
      INTO v_view, v_edit, v_delete
    FROM public.custom_role_module_permissions p
    JOIN public.user_custom_roles u ON u.custom_role_id = p.custom_role_id
    WHERE u.user_id = _user_id AND p.module = _module;
    v_found := v_view IS NOT NULL;
  END IF;

  IF NOT v_found THEN
    SELECT bool_or(p.can_view), bool_or(p.can_edit), bool_or(p.can_delete)
      INTO v_view, v_edit, v_delete
    FROM public.system_role_module_permissions p
    JOIN public.user_roles r ON r.role = p.role
    WHERE r.user_id = _user_id AND p.module = _module;
    v_found := v_view IS NOT NULL;
  END IF;

  IF NOT v_found THEN
    RETURN public.is_admin_or_gestor(_user_id);
  END IF;

  RETURN CASE _action
    WHEN 'view' THEN COALESCE(v_view, false)
    WHEN 'edit' THEN COALESCE(v_edit, false)
    ELSE COALESCE(v_delete, false)
  END;
END $$;

-- 2. Seed do módulo prestacao para cargos do sistema
INSERT INTO public.system_role_module_permissions(role, module, can_view, can_edit, can_delete) VALUES
  ('admin','prestacao', true, true, true),
  ('gestor','prestacao', true, true, false),
  ('financeiro','prestacao', true, true, false),
  ('colaborador','prestacao', true, true, false)
ON CONFLICT (role, module) DO NOTHING;

CREATE OR REPLACE FUNCTION public.seed_default_perms_for_role(_custom_role_id uuid, _template app_role)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  modules text[] := ARRAY['dashboard','funcionarios','tarefas','obras','ativos','ferramentas','materiais','epis','financeiro','prestacao','documentos','acessos'];
  m text;
  v_view bool; v_edit bool; v_delete bool;
BEGIN
  FOREACH m IN ARRAY modules LOOP
    IF _template = 'admin' THEN
      v_view := true; v_edit := true; v_delete := true;
    ELSIF m = 'acessos' THEN
      v_view := false; v_edit := false; v_delete := false;
    ELSIF _template = 'gestor' THEN
      v_view := true; v_edit := true; v_delete := false;
    ELSIF _template = 'financeiro' THEN
      IF m IN ('financeiro','prestacao') THEN
        v_view := true; v_edit := true; v_delete := false;
      ELSE
        v_view := true; v_edit := false; v_delete := false;
      END IF;
    ELSE
      v_view := m IN ('dashboard','tarefas','funcionarios','epis','documentos','prestacao');
      v_edit := (m = 'prestacao');
      v_delete := false;
    END IF;
    INSERT INTO public.custom_role_module_permissions (custom_role_id, module, can_view, can_edit, can_delete)
    VALUES (_custom_role_id, m, v_view, v_edit, v_delete)
    ON CONFLICT (custom_role_id, module) DO UPDATE
      SET can_view = EXCLUDED.can_view, can_edit = EXCLUDED.can_edit, can_delete = EXCLUDED.can_delete;
  END LOOP;
END $function$;

-- 3. Tabelas do módulo prestação de contas
CREATE TABLE public.adiantamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  responsavel_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  responsavel_nome text,
  obra_id uuid REFERENCES public.obras(id) ON DELETE SET NULL,
  valor numeric NOT NULL DEFAULT 0,
  data date NOT NULL DEFAULT current_date,
  status text NOT NULL DEFAULT 'aberto',
  observacoes text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.adiantamentos TO authenticated;
GRANT ALL ON public.adiantamentos TO service_role;
ALTER TABLE public.adiantamentos ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER adiantamentos_touch BEFORE UPDATE ON public.adiantamentos
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE POLICY "adiantamentos_sel" ON public.adiantamentos FOR SELECT TO authenticated
USING (
  responsavel_id = auth.uid() OR created_by = auth.uid()
  OR (public.can_module(auth.uid(), 'prestacao', 'edit')
      AND (obra_id IS NULL OR public.has_obra_access(auth.uid(), obra_id)))
);
CREATE POLICY "adiantamentos_ins" ON public.adiantamentos FOR INSERT TO authenticated
WITH CHECK (public.can_module(auth.uid(), 'prestacao', 'edit') AND created_by = auth.uid());
CREATE POLICY "adiantamentos_upd" ON public.adiantamentos FOR UPDATE TO authenticated
USING (public.can_module(auth.uid(), 'prestacao', 'edit') AND (created_by = auth.uid() OR responsavel_id = auth.uid() OR public.is_admin_or_gestor(auth.uid())))
WITH CHECK (public.can_module(auth.uid(), 'prestacao', 'edit'));
CREATE POLICY "adiantamentos_del" ON public.adiantamentos FOR DELETE TO authenticated
USING (public.can_module(auth.uid(), 'prestacao', 'delete'));

CREATE TABLE public.adiantamento_despesas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  adiantamento_id uuid NOT NULL REFERENCES public.adiantamentos(id) ON DELETE CASCADE,
  descricao text NOT NULL,
  categoria text,
  valor numeric NOT NULL DEFAULT 0,
  data date NOT NULL DEFAULT current_date,
  cupom_url text,
  observacoes text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.adiantamento_despesas TO authenticated;
GRANT ALL ON public.adiantamento_despesas TO service_role;
ALTER TABLE public.adiantamento_despesas ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER adiantamento_despesas_touch BEFORE UPDATE ON public.adiantamento_despesas
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE POLICY "despesas_sel" ON public.adiantamento_despesas FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.adiantamentos a WHERE a.id = adiantamento_id));
CREATE POLICY "despesas_ins" ON public.adiantamento_despesas FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND EXISTS (SELECT 1 FROM public.adiantamentos a WHERE a.id = adiantamento_id AND a.status = 'aberto')
  AND public.can_module(auth.uid(), 'prestacao', 'edit')
);
CREATE POLICY "despesas_upd" ON public.adiantamento_despesas FOR UPDATE TO authenticated
USING (public.can_module(auth.uid(), 'prestacao', 'edit') AND (created_by = auth.uid() OR public.is_admin_or_gestor(auth.uid())))
WITH CHECK (public.can_module(auth.uid(), 'prestacao', 'edit'));
CREATE POLICY "despesas_del" ON public.adiantamento_despesas FOR DELETE TO authenticated
USING (created_by = auth.uid() OR public.can_module(auth.uid(), 'prestacao', 'delete'));

-- 4. Políticas de escrita passam a respeitar as permissões por módulo
DROP POLICY IF EXISTS funcionarios_insert_gestor ON public.funcionarios;
DROP POLICY IF EXISTS funcionarios_update_gestor ON public.funcionarios;
DROP POLICY IF EXISTS funcionarios_delete_admin ON public.funcionarios;
CREATE POLICY funcionarios_ins ON public.funcionarios FOR INSERT TO authenticated WITH CHECK (public.can_module(auth.uid(),'funcionarios','edit'));
CREATE POLICY funcionarios_upd ON public.funcionarios FOR UPDATE TO authenticated USING (public.can_module(auth.uid(),'funcionarios','edit')) WITH CHECK (public.can_module(auth.uid(),'funcionarios','edit'));
CREATE POLICY funcionarios_del ON public.funcionarios FOR DELETE TO authenticated USING (public.can_module(auth.uid(),'funcionarios','delete'));

DROP POLICY IF EXISTS obras_ins ON public.obras;
DROP POLICY IF EXISTS obras_upd ON public.obras;
DROP POLICY IF EXISTS obras_del ON public.obras;
CREATE POLICY obras_ins ON public.obras FOR INSERT TO authenticated WITH CHECK (public.can_module(auth.uid(),'obras','edit'));
CREATE POLICY obras_upd ON public.obras FOR UPDATE TO authenticated USING (public.can_module(auth.uid(),'obras','edit')) WITH CHECK (public.can_module(auth.uid(),'obras','edit'));
CREATE POLICY obras_del ON public.obras FOR DELETE TO authenticated USING (public.can_module(auth.uid(),'obras','delete'));

DROP POLICY IF EXISTS ativos_ins ON public.ativos;
DROP POLICY IF EXISTS ativos_upd ON public.ativos;
DROP POLICY IF EXISTS ativos_del ON public.ativos;
CREATE POLICY ativos_ins ON public.ativos FOR INSERT TO authenticated WITH CHECK (public.can_module(auth.uid(),'ativos','edit'));
CREATE POLICY ativos_upd ON public.ativos FOR UPDATE TO authenticated USING (public.can_module(auth.uid(),'ativos','edit')) WITH CHECK (public.can_module(auth.uid(),'ativos','edit'));
CREATE POLICY ativos_del ON public.ativos FOR DELETE TO authenticated USING (public.can_module(auth.uid(),'ativos','delete'));

DROP POLICY IF EXISTS fer_ins ON public.ferramentas;
DROP POLICY IF EXISTS fer_upd ON public.ferramentas;
DROP POLICY IF EXISTS fer_del ON public.ferramentas;
CREATE POLICY fer_ins ON public.ferramentas FOR INSERT TO authenticated WITH CHECK (public.can_module(auth.uid(),'ferramentas','edit'));
CREATE POLICY fer_upd ON public.ferramentas FOR UPDATE TO authenticated USING (public.can_module(auth.uid(),'ferramentas','edit')) WITH CHECK (public.can_module(auth.uid(),'ferramentas','edit'));
CREATE POLICY fer_del ON public.ferramentas FOR DELETE TO authenticated USING (public.can_module(auth.uid(),'ferramentas','delete'));

DROP POLICY IF EXISTS mat_ins ON public.materiais;
DROP POLICY IF EXISTS mat_upd ON public.materiais;
DROP POLICY IF EXISTS mat_del ON public.materiais;
CREATE POLICY mat_ins ON public.materiais FOR INSERT TO authenticated WITH CHECK (public.can_module(auth.uid(),'materiais','edit'));
CREATE POLICY mat_upd ON public.materiais FOR UPDATE TO authenticated USING (public.can_module(auth.uid(),'materiais','edit')) WITH CHECK (public.can_module(auth.uid(),'materiais','edit'));
CREATE POLICY mat_del ON public.materiais FOR DELETE TO authenticated USING (public.can_module(auth.uid(),'materiais','delete'));

DROP POLICY IF EXISTS mm_ins ON public.material_movimentos;
DROP POLICY IF EXISTS mm_upd ON public.material_movimentos;
DROP POLICY IF EXISTS mm_del ON public.material_movimentos;
CREATE POLICY mm_ins ON public.material_movimentos FOR INSERT TO authenticated WITH CHECK (public.can_module(auth.uid(),'materiais','edit'));
CREATE POLICY mm_upd ON public.material_movimentos FOR UPDATE TO authenticated USING (public.can_module(auth.uid(),'materiais','edit')) WITH CHECK (public.can_module(auth.uid(),'materiais','edit'));
CREATE POLICY mm_del ON public.material_movimentos FOR DELETE TO authenticated USING (public.can_module(auth.uid(),'materiais','delete'));

DROP POLICY IF EXISTS epis_insert_gestor ON public.epis;
DROP POLICY IF EXISTS epis_update_gestor ON public.epis;
DROP POLICY IF EXISTS epis_delete_admin ON public.epis;
CREATE POLICY epis_ins ON public.epis FOR INSERT TO authenticated WITH CHECK (public.can_module(auth.uid(),'epis','edit'));
CREATE POLICY epis_upd ON public.epis FOR UPDATE TO authenticated USING (public.can_module(auth.uid(),'epis','edit')) WITH CHECK (public.can_module(auth.uid(),'epis','edit'));
CREATE POLICY epis_del ON public.epis FOR DELETE TO authenticated USING (public.can_module(auth.uid(),'epis','delete'));

DROP POLICY IF EXISTS epi_mov_insert_gestor ON public.epi_movimentos;
DROP POLICY IF EXISTS epi_mov_update_gestor ON public.epi_movimentos;
DROP POLICY IF EXISTS epi_mov_delete_admin ON public.epi_movimentos;
CREATE POLICY epi_mov_ins ON public.epi_movimentos FOR INSERT TO authenticated WITH CHECK (public.can_module(auth.uid(),'epis','edit'));
CREATE POLICY epi_mov_upd ON public.epi_movimentos FOR UPDATE TO authenticated USING (public.can_module(auth.uid(),'epis','edit')) WITH CHECK (public.can_module(auth.uid(),'epis','edit'));
CREATE POLICY epi_mov_del ON public.epi_movimentos FOR DELETE TO authenticated USING (public.can_module(auth.uid(),'epis','delete'));

DROP POLICY IF EXISTS tarefas_insert_gestor ON public.tarefas;
DROP POLICY IF EXISTS tarefas_delete_admin ON public.tarefas;
CREATE POLICY tarefas_ins ON public.tarefas FOR INSERT TO authenticated WITH CHECK (public.can_module(auth.uid(),'tarefas','edit') OR created_by = auth.uid());
CREATE POLICY tarefas_del ON public.tarefas FOR DELETE TO authenticated USING (public.can_module(auth.uid(),'tarefas','delete') OR created_by = auth.uid());
