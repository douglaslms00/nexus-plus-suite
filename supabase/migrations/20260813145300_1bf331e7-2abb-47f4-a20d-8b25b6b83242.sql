-- 1) Lock down SECURITY DEFINER functions exposed via the API
-- Trigger functions and internal helpers: not callable by anyone via the API
REVOKE EXECUTE ON FUNCTION public.apply_material_movimento() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_custom_role_perms() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_custom_roles() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_user_custom_roles() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_user_module_permissions() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_user_roles() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tarefas_notify() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_permission_change(text, uuid, uuid, text, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_user(uuid, text, text, text, text, text, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_default_perms_for_role(uuid, app_role) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.promote_to_admin_if_no_admin() FROM anon, authenticated;

-- Admin RPCs: signed-in only (each already verifies admin role internally)
REVOKE EXECUTE ON FUNCTION public.admin_bulk_set_custom_role(uuid[], uuid, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_create_custom_role_from_template(text, text, text, app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_create_custom_role_inherit(text, text, text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_delete_user(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_role(uuid, app_role, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_system_role_label(app_role, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_system_role_perm(app_role, text, boolean, boolean, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_update_custom_role(uuid, text, text, text) FROM anon;

-- Permission helpers used inside RLS policies: keep for authenticated, drop for anon
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_admin_or_gestor(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_obra_access(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_module(uuid, text, text) FROM anon;

-- 2) Restrict SELECT on adiantamento_despesas
DROP POLICY IF EXISTS despesas_sel ON public.adiantamento_despesas;
CREATE POLICY despesas_sel ON public.adiantamento_despesas
FOR SELECT TO authenticated
USING (
  created_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.adiantamentos a
    WHERE a.id = adiantamento_despesas.adiantamento_id
      AND (
        a.created_by = auth.uid()
        OR a.responsavel_id = auth.uid()
        OR public.is_admin_or_gestor(auth.uid())
        OR (a.obra_id IS NOT NULL AND public.has_obra_access(auth.uid(), a.obra_id))
      )
  )
);