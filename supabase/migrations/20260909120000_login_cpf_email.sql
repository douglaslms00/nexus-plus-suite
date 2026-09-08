-- Login por CPF ou E-mail: adiciona coluna cpf em profiles e RPC para resolver e-mail por CPF

-- 1) Coluna CPF
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cpf text;

-- Normaliza CPF existentes (remove mascara) onde possivel - opcional
-- Nao faz alteracao de dados existentes, apenas garante formato limpo futuro sera tratado na aplicacao

-- Indice unico para CPF (apenas digitos, ignorando formatacao)
CREATE UNIQUE INDEX IF NOT EXISTS profiles_cpf_unique
  ON public.profiles ((regexp_replace(cpf, '[^0-9]', '', 'g')))
  WHERE cpf IS NOT NULL AND btrim(cpf) <> '';

-- 2) Permissoes: permite leitura de cpf para usuarios autenticados (mantem email oculto)
REVOKE SELECT ON public.profiles FROM authenticated;
GRANT SELECT (id, nome, setor, avatar_url, created_at, updated_at, cpf) ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

-- Permite update do proprio perfil (inclui cpf)
GRANT UPDATE (nome, setor, avatar_url, cpf) ON public.profiles TO authenticated;
GRANT INSERT (id, nome, email, cpf) ON public.profiles TO authenticated;

-- Politica para UPDATE do proprio perfil (se ainda nao existir)
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;
CREATE POLICY profiles_insert_own ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

-- 3) Funcao para buscar e-mail por CPF (usada no login anonimo)
CREATE OR REPLACE FUNCTION public.get_email_by_cpf(cpf_input text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_email text;
  v_clean text;
BEGIN
  IF cpf_input IS NULL OR btrim(cpf_input) = '' THEN
    RETURN NULL;
  END IF;
  v_clean := regexp_replace(cpf_input, '[^0-9]', '', 'g');
  IF length(v_clean) != 11 THEN
    RETURN NULL;
  END IF;

  -- Busca email na tabela auth.users via join com profiles.cpf
  SELECT u.email INTO v_email
  FROM auth.users u
  JOIN public.profiles p ON p.id = u.id
  WHERE regexp_replace(COALESCE(p.cpf, ''), '[^0-9]', '', 'g') = v_clean
  LIMIT 1;

  IF v_email IS NOT NULL THEN
    RETURN v_email;
  END IF;

  -- Fallback: busca direto em profiles (caso ainda nao sincronizado com auth.users)
  SELECT p.email INTO v_email
  FROM public.profiles p
  WHERE regexp_replace(COALESCE(p.cpf, ''), '[^0-9]', '', 'g') = v_clean
  LIMIT 1;

  RETURN v_email;
END;
$$;

REVOKE ALL ON FUNCTION public.get_email_by_cpf(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_email_by_cpf(text) TO anon, authenticated;

-- 4) Atualiza handle_new_user para persistir CPF vindo de raw_user_meta_data
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_cpf text;
BEGIN
  v_cpf := NULLIF(regexp_replace(COALESCE(NEW.raw_user_meta_data->>'cpf', ''), '[^0-9]', '', 'g'), '');

  INSERT INTO public.profiles (id, nome, email, cpf)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'nome',''), split_part(NEW.email,'@',1)),
    NEW.email,
    v_cpf
  )
  ON CONFLICT (id) DO UPDATE SET
    nome = COALESCE(EXCLUDED.nome, public.profiles.nome),
    email = COALESCE(EXCLUDED.email, public.profiles.email),
    cpf = COALESCE(EXCLUDED.cpf, public.profiles.cpf);

  -- Papel padrao colaborador se nao houver nenhum
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = NEW.id) THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'colaborador') ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- Garante trigger em auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 5) Atualiza ensure_profile para sincronizar CPF quando chamado por usuario logado
CREATE OR REPLACE FUNCTION public.ensure_profile()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _email text;
  _nome text;
  _cpf text;
BEGIN
  IF _uid IS NULL THEN RETURN; END IF;
  SELECT email, raw_user_meta_data->>'nome', raw_user_meta_data->>'cpf'
    INTO _email, _nome, _cpf
  FROM auth.users WHERE id = _uid;

  INSERT INTO public.profiles (id, nome, email, cpf)
  VALUES (
    _uid,
    COALESCE(NULLIF(_nome,''), split_part(_email,'@',1)),
    _email,
    NULLIF(regexp_replace(COALESCE(_cpf,''), '[^0-9]', '', 'g'), '')
  )
  ON CONFLICT (id) DO UPDATE SET
    email = COALESCE(EXCLUDED.email, public.profiles.email),
    cpf = COALESCE(EXCLUDED.cpf, public.profiles.cpf);
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_profile() TO authenticated;
