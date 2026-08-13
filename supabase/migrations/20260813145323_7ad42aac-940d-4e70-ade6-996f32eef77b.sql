DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.admin_bulk_set_custom_role(uuid[], uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_custom_role_from_template(text, text, text, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_custom_role_inherit(text, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_role(uuid, app_role, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_system_role_label(app_role, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_system_role_perm(app_role, text, boolean, boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_custom_role(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_or_gestor(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_obra_access(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_module(uuid, text, text) TO authenticated;