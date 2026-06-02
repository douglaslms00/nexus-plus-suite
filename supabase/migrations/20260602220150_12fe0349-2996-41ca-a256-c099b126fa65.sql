
-- 1) Fix runtime: ensure RLS helper functions are executable by authenticated role
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_or_gestor(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_admin_or_gestor(uuid) FROM anon, public;

-- 2) Lock down admin-only RPCs from anon/public; keep available to authenticated (they enforce internally)
REVOKE EXECUTE ON FUNCTION public.admin_set_role(uuid, app_role, boolean) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.admin_set_role(uuid, app_role, boolean) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.promote_to_admin_if_no_admin() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.promote_to_admin_if_no_admin() TO authenticated;

-- 3) funcionarios: restrict PII reads to admin/gestor
DROP POLICY IF EXISTS funcionarios_select_authenticated ON public.funcionarios;
CREATE POLICY funcionarios_select_admin_gestor ON public.funcionarios
  FOR SELECT TO authenticated
  USING (public.is_admin_or_gestor(auth.uid()));

-- 4) ativo_transferencias: only admin/gestor can request transfers
DROP POLICY IF EXISTS at_ins ON public.ativo_transferencias;
CREATE POLICY at_ins ON public.ativo_transferencias
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_gestor(auth.uid()));

-- 5) user_roles: explicit admin-only INSERT/UPDATE/DELETE
CREATE POLICY user_roles_admin_insert ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY user_roles_admin_update ON public.user_roles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY user_roles_admin_delete ON public.user_roles
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
