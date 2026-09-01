DROP VIEW IF EXISTS public.profiles_basico;

DROP POLICY IF EXISTS profiles_select_own_or_admin ON public.profiles;
CREATE POLICY profiles_select_authenticated ON public.profiles
FOR SELECT TO authenticated USING (true);

-- Column-level privileges: hide email from the Data API for regular users
REVOKE SELECT ON public.profiles FROM authenticated;
GRANT SELECT (id, nome, setor, avatar_url, created_at, updated_at) ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

CREATE OR REPLACE FUNCTION public.admin_list_profile_emails()
RETURNS TABLE (id uuid, email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.email
  FROM public.profiles p
  WHERE public.is_admin_or_gestor(auth.uid()) OR public.has_role(auth.uid(), 'admin');
$$;

REVOKE ALL ON FUNCTION public.admin_list_profile_emails() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_profile_emails() TO authenticated;