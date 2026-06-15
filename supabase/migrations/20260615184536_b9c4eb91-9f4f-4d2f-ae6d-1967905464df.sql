
-- 1) Permissões editáveis para cargos do sistema
CREATE TABLE IF NOT EXISTS public.system_role_module_permissions (
  role public.app_role NOT NULL,
  module text NOT NULL,
  can_view boolean NOT NULL DEFAULT false,
  can_edit boolean NOT NULL DEFAULT false,
  can_delete boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role, module)
);
GRANT SELECT ON public.system_role_module_permissions TO authenticated;
GRANT ALL ON public.system_role_module_permissions TO service_role;
ALTER TABLE public.system_role_module_permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS srmp_sel ON public.system_role_module_permissions;
CREATE POLICY srmp_sel ON public.system_role_module_permissions
  FOR SELECT TO authenticated USING (true);

-- Seed defaults (idempotent)
INSERT INTO public.system_role_module_permissions (role, module, can_view, can_edit, can_delete)
SELECT r.role, m.module,
  CASE
    WHEN r.role = 'admin' THEN true
    WHEN m.module = 'acessos' THEN false
    WHEN r.role = 'gestor' THEN true
    WHEN r.role = 'financeiro' THEN true
    WHEN r.role = 'colaborador' AND m.module IN ('dashboard','tarefas','funcionarios','epis','documentos') THEN true
    ELSE false
  END AS can_view,
  CASE
    WHEN r.role = 'admin' THEN true
    WHEN m.module = 'acessos' THEN false
    WHEN r.role = 'gestor' THEN true
    WHEN r.role = 'financeiro' AND m.module = 'financeiro' THEN true
    ELSE false
  END AS can_edit,
  CASE WHEN r.role = 'admin' THEN true ELSE false END AS can_delete
FROM (VALUES ('admin'::public.app_role), ('gestor'), ('financeiro'), ('colaborador')) AS r(role)
CROSS JOIN (VALUES ('dashboard'), ('funcionarios'), ('tarefas'), ('obras'), ('ativos'),
                   ('ferramentas'), ('materiais'), ('epis'), ('financeiro'),
                   ('documentos'), ('acessos')) AS m(module)
ON CONFLICT (role, module) DO NOTHING;

CREATE OR REPLACE FUNCTION public.admin_set_system_role_perm(
  _role public.app_role, _module text,
  _can_view boolean, _can_edit boolean, _can_delete boolean
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Apenas admin pode alterar permissões de cargos do sistema';
  END IF;
  -- Guarda-corpo: admin sempre mantém acesso total a Acessos
  IF _role = 'admin' AND _module = 'acessos' THEN
    _can_view := true; _can_edit := true; _can_delete := true;
  END IF;
  INSERT INTO public.system_role_module_permissions(role, module, can_view, can_edit, can_delete, updated_at)
  VALUES (_role, _module, _can_view, _can_edit, _can_delete, now())
  ON CONFLICT (role, module) DO UPDATE
    SET can_view = EXCLUDED.can_view,
        can_edit = EXCLUDED.can_edit,
        can_delete = EXCLUDED.can_delete,
        updated_at = now();
END $$;
REVOKE ALL ON FUNCTION public.admin_set_system_role_perm(public.app_role, text, boolean, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_system_role_perm(public.app_role, text, boolean, boolean, boolean) TO authenticated;

-- 2) Notifications realtime hardening: voltar REPLICA IDENTITY para DEFAULT
ALTER TABLE public.notifications REPLICA IDENTITY DEFAULT;

-- 3) Tarefas: permitir destinatário (assigned_to) ver e responder
DROP POLICY IF EXISTS tarefas_select_own_or_gestor ON public.tarefas;
CREATE POLICY tarefas_select_own_or_gestor ON public.tarefas
  FOR SELECT TO authenticated
  USING (
    responsavel_id = auth.uid()
    OR created_by = auth.uid()
    OR assigned_to = auth.uid()
    OR public.is_admin_or_gestor(auth.uid())
  );

DROP POLICY IF EXISTS tarefas_update_owner_or_gestor ON public.tarefas;
CREATE POLICY tarefas_update_owner_or_gestor ON public.tarefas
  FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    OR responsavel_id = auth.uid()
    OR assigned_to = auth.uid()
    OR public.is_admin_or_gestor(auth.uid())
  )
  WITH CHECK (
    created_by = auth.uid()
    OR responsavel_id = auth.uid()
    OR assigned_to = auth.uid()
    OR public.is_admin_or_gestor(auth.uid())
  );
