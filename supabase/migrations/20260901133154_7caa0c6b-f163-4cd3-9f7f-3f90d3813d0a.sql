-- Backfill de perfis faltantes
INSERT INTO public.profiles (id, nome, email)
SELECT u.id,
       COALESCE(NULLIF(u.raw_user_meta_data->>'nome',''), split_part(u.email,'@',1)),
       u.email
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;

-- Garante o perfil no acesso (chamado pelo app)
CREATE OR REPLACE FUNCTION public.ensure_profile()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RETURN; END IF;
  INSERT INTO public.profiles (id, nome, email)
  SELECT u.id,
         COALESCE(NULLIF(u.raw_user_meta_data->>'nome',''), split_part(u.email,'@',1)),
         u.email
  FROM auth.users u
  WHERE u.id = _uid
  ON CONFLICT (id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_profile() TO authenticated;

-- Usuários logados precisam ver os colegas (atribuição de tarefas, acessos)
DROP POLICY IF EXISTS profiles_select_self_or_admin ON public.profiles;
CREATE POLICY profiles_select_authenticated ON public.profiles
FOR SELECT TO authenticated
USING (true);