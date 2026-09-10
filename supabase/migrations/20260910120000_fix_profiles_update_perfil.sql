-- Corrige erro "sempre dá erro" ao salvar Meu Perfil (nome/setor/avatar/cpf)
--
-- Causa raiz:
-- 1) GRANT UPDATE em profiles listava apenas (nome, setor, avatar_url, cpf),
--    mas a tabela tem trigger BEFORE UPDATE que escreve NEW.updated_at
--    (touch_updated_at, SECURITY INVOKER). Sem UPDATE em updated_at,
--    todo UPDATE falha com permission denied.
-- 2) Garante que o trigger existe e roda como SECURITY DEFINER,
--    para não depender de privilégio de coluna do usuário comum.
-- 3) Reafirma SELECT/UPDATE/INSERT + policies do próprio perfil.

-- 1) Torna touch_updated_at SECURITY DEFINER (não quebra outros triggers)
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;

-- 2) Garante trigger de updated_at em profiles
DROP TRIGGER IF EXISTS trg_profiles_touch ON public.profiles;
CREATE TRIGGER trg_profiles_touch
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3) Privilégios por coluna: inclui updated_at no UPDATE
REVOKE SELECT ON public.profiles FROM authenticated;
GRANT SELECT (id, nome, setor, avatar_url, created_at, updated_at, cpf) ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

-- Importante: incluir updated_at aqui, senão o trigger acima falha com permission denied
GRANT UPDATE (nome, setor, avatar_url, cpf, updated_at) ON public.profiles TO authenticated;
GRANT INSERT (id, nome, email, cpf) ON public.profiles TO authenticated;

-- 4) Policies do próprio perfil (idempotentes)
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;
CREATE POLICY profiles_insert_own ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());
