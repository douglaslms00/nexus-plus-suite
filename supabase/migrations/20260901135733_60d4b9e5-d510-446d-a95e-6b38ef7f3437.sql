ALTER TABLE public.funcionarios
  ADD COLUMN IF NOT EXISTS endereco text,
  ADD COLUMN IF NOT EXISTS cidade text;

-- Restrict profile reads
DROP POLICY IF EXISTS profiles_select_authenticated ON public.profiles;
CREATE POLICY profiles_select_own_or_admin ON public.profiles
FOR SELECT TO authenticated
USING (id = auth.uid() OR public.is_admin_or_gestor(auth.uid()) OR public.has_role(auth.uid(), 'admin'));

-- Limited directory view (no email)
CREATE OR REPLACE VIEW public.profiles_basico
WITH (security_invoker = off) AS
  SELECT id, nome, setor, avatar_url FROM public.profiles;

REVOKE ALL ON public.profiles_basico FROM PUBLIC, anon;
GRANT SELECT ON public.profiles_basico TO authenticated;
GRANT ALL ON public.profiles_basico TO service_role;