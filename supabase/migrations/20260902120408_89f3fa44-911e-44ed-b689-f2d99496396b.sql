DROP POLICY IF EXISTS "profiles_select_authenticated" ON public.profiles;

CREATE POLICY "profiles_select_own_or_manager" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_admin_or_gestor(auth.uid()));

CREATE OR REPLACE FUNCTION public.list_profile_directory()
RETURNS TABLE(id uuid, nome text, avatar_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.id, p.nome, p.avatar_url
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL;
$$;

REVOKE EXECUTE ON FUNCTION public.list_profile_directory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_profile_directory() TO authenticated;