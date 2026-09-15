-- Migration: fix admin_create_user_login auth columns + cleanup NULLs
-- Corrige "500: Database error querying schema" no login/signup.
--
-- Causa raiz (doc oficial Supabase):
-- INSERT manual em auth.users deixava como NULL colunas que o GoTrue
-- espera como string vazia (''): confirmation_token, recovery_token,
-- email_change, email_change_token_new, etc.
-- Resultado no Auth log: Scan error ... "confirmation_token":
-- converting NULL to string is unsupported.
--
-- Correção:
-- 1) Recria a função preenchendo todas as colunas de token com ''
--    e usando o instance_id real de auth.instances (não zeros fixos).
-- 2) Limpa linhas já quebradas (NULL -> '').
-- 3) Checagem de e-mail duplicado com mensagem amigável.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto') THEN
    CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.admin_create_user_login(
  _email       TEXT,
  _password    TEXT,
  _nome        TEXT,
  _is_admin    BOOLEAN DEFAULT FALSE,
  _cargo_key   TEXT    DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_user_id     uuid;
  v_caller_id   uuid;
  v_caller_role TEXT;
  v_sys_role    TEXT;
  v_custom_id   uuid;
  v_instance_id uuid;
BEGIN
  v_caller_id := auth.uid();
  SELECT role INTO v_caller_role
  FROM public.user_roles
  WHERE user_id = v_caller_id AND role IN ('admin', 'gestor')
  LIMIT 1;

  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'Permissao negada: apenas administradores e gestores podem criar usuarios.';
  END IF;

  IF _is_admin = TRUE AND v_caller_role != 'admin' THEN
    RAISE EXCEPTION 'Permissao negada: apenas administradores podem criar outros administradores.';
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = lower(_email)) THEN
    RAISE EXCEPTION 'Este e-mail já está cadastrado.';
  END IF;

  -- instance_id real do projeto (hardcodar zeros quebra o Auth)
  SELECT id INTO v_instance_id FROM auth.instances LIMIT 1;
  IF v_instance_id IS NULL THEN
    v_instance_id := '00000000-0000-0000-0000-000000000000';
  END IF;

  -- INSERT completo: GoTrue NÃO aceita NULL nas colunas de token.
  -- Todas vão como '' (padrão do Auth API). Timestamptz opcionais ficam NULL.
  -- confirmed_at é coluna gerada: não incluir.
  INSERT INTO auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    confirmation_token,
    confirmation_sent_at,
    recovery_token,
    recovery_sent_at,
    email_change_token_new,
    email_change,
    email_change_sent_at,
    email_change_token_current,
    email_change_confirm_status,
    phone,
    phone_confirmed_at,
    phone_change,
    phone_change_token,
    phone_change_sent_at,
    reauthentication_token,
    reauthentication_sent_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_super_admin,
    is_sso_user,
    is_anonymous,
    created_at,
    updated_at
  )
  VALUES (
    gen_random_uuid(),
    v_instance_id,
    'authenticated',
    'authenticated',
    _email,
    crypt(_password, gen_salt('bf')),
    now(),
    '',      -- confirmation_token
    NULL,    -- confirmation_sent_at
    '',      -- recovery_token
    NULL,    -- recovery_sent_at
    '',      -- email_change_token_new
    '',      -- email_change
    NULL,    -- email_change_sent_at
    '',      -- email_change_token_current
    0,       -- email_change_confirm_status
    '',      -- phone (GoTrue espera '' e não NULL)
    NULL,    -- phone_confirmed_at
    '',      -- phone_change
    '',      -- phone_change_token
    NULL,    -- phone_change_sent_at
    '',      -- reauthentication_token
    NULL,    -- reauthentication_sent_at
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('nome', _nome),
    FALSE,
    FALSE,
    FALSE,
    now(),
    now()
  )
  RETURNING id INTO v_user_id;

  INSERT INTO public.profiles (id, nome, email, created_at, updated_at)
  VALUES (v_user_id, _nome, _email, now(), now())
  ON CONFLICT (id) DO UPDATE SET
    nome = EXCLUDED.nome,
    email = EXCLUDED.email;

  IF _is_admin THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_user_id, 'admin')
    ON CONFLICT DO NOTHING;
  ELSIF _cargo_key IS NOT NULL THEN
    IF _cargo_key LIKE 'sys:%' THEN
      v_sys_role := substring(_cargo_key FROM 5);
      INSERT INTO public.user_roles (user_id, role)
      VALUES (v_user_id, v_sys_role::public.app_role)
      ON CONFLICT DO NOTHING;
    ELSIF _cargo_key LIKE 'cus:%' THEN
      v_custom_id := (substring(_cargo_key FROM 5))::uuid;
      INSERT INTO public.user_custom_roles (user_id, custom_role_id)
      VALUES (v_user_id, v_custom_id)
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  RETURN v_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_user_login(TEXT, TEXT, TEXT, BOOLEAN, TEXT) TO authenticated;

-- Limpeza de usuários já criados com NULL (causam o 500 no login).
-- Idempotente: só toca onde IS NULL. Colunas timestamptz/bool podem ser NULL.
UPDATE auth.users SET confirmation_token = '' WHERE confirmation_token IS NULL;
UPDATE auth.users SET recovery_token = '' WHERE recovery_token IS NULL;
UPDATE auth.users SET email_change_token_new = '' WHERE email_change_token_new IS NULL;
UPDATE auth.users SET email_change = '' WHERE email_change IS NULL;
UPDATE auth.users SET email_change_token_current = '' WHERE email_change_token_current IS NULL;
UPDATE auth.users SET phone = '' WHERE phone IS NULL;
UPDATE auth.users SET phone_change = '' WHERE phone_change IS NULL;
UPDATE auth.users SET phone_change_token = '' WHERE phone_change_token IS NULL;
UPDATE auth.users SET reauthentication_token = '' WHERE reauthentication_token IS NULL;
UPDATE auth.users SET email = '' WHERE email IS NULL;

NOTIFY pgrst, 'reload schema';
