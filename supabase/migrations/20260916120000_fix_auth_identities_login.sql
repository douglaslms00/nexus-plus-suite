-- Migration: fix_auth_identities_login.sql
-- Corrige o erro "HTTP 500 / Database error querying schema" ao logar via Gotrue.
-- Causa: Usuários inseridos em auth.users via admin_create_user_login (ou inserção manual)
-- não possuíam o registro correspondente na tabela auth.identities. O GoTrue exige
-- uma identidade vinculada a cada usuário durante o signInWithPassword.

-- 1) Atualiza admin_create_user_login para sempre criar a linha em auth.identities
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

  SELECT id INTO v_instance_id FROM auth.instances LIMIT 1;
  IF v_instance_id IS NULL THEN
    v_instance_id := '00000000-0000-0000-0000-000000000000';
  END IF;

  -- Insert completo em auth.users
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    confirmation_token, confirmation_sent_at, recovery_token, recovery_sent_at,
    email_change_token_new, email_change, email_change_sent_at, email_change_token_current,
    email_change_confirm_status, phone, phone_confirmed_at, phone_change, phone_change_token,
    phone_change_sent_at, reauthentication_token, reauthentication_sent_at, raw_app_meta_data,
    raw_user_meta_data, is_super_admin, is_sso_user, is_anonymous, created_at, updated_at
  )
  VALUES (
    gen_random_uuid(), v_instance_id, 'authenticated', 'authenticated', lower(_email),
    crypt(_password, gen_salt('bf')), now(), '', NULL, '', NULL, '', '', NULL, '', 0,
    NULL, NULL, NULL, NULL, NULL, '', NULL,
    '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('nome', _nome),
    FALSE, FALSE, FALSE, now(), now()
  )
  RETURNING id INTO v_user_id;

  -- INSERT em auth.identities (vital para o Supabase Auth / GoTrue)
  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at,
    provider_id
  )
  VALUES (
    gen_random_uuid(),
    v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', lower(_email)),
    'email',
    now(),
    now(),
    now(),
    v_user_id::text
  )
  ON CONFLICT DO NOTHING;

  -- Perfil público
  INSERT INTO public.profiles (id, nome, email, created_at, updated_at)
  VALUES (v_user_id, _nome, _email, now(), now())
  ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, email = EXCLUDED.email;

  -- Papéis de usuário
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

-- 2) Cria a identidade em auth.identities para TODOS os usuários existentes que não possuem
INSERT INTO auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at,
  provider_id
)
SELECT
  gen_random_uuid(),
  u.id,
  jsonb_build_object('sub', u.id::text, 'email', lower(u.email)),
  'email',
  u.created_at,
  u.created_at,
  u.updated_at,
  u.id::text
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM auth.identities i WHERE i.user_id = u.id
);

-- 3) Garante tokens válidos e limpa campos NULL restantes em auth.users
UPDATE auth.users 
SET 
  aud = COALESCE(NULLIF(aud, ''), 'authenticated'),
  role = COALESCE(NULLIF(role, ''), 'authenticated'),
  email = COALESCE(email, ''),
  encrypted_password = COALESCE(encrypted_password, ''),
  confirmation_token = COALESCE(confirmation_token, ''),
  recovery_token = COALESCE(recovery_token, ''),
  email_change_token_new = COALESCE(email_change_token_new, ''),
  email_change = COALESCE(email_change, ''),
  email_change_token_current = COALESCE(email_change_token_current, ''),
  phone_change = COALESCE(phone_change, ''),
  phone_change_token = COALESCE(phone_change_token, ''),
  reauthentication_token = COALESCE(reauthentication_token, ''),
  email_change_confirm_status = COALESCE(email_change_confirm_status, 0),
  is_super_admin = COALESCE(is_super_admin, false),
  is_sso_user = COALESCE(is_sso_user, false),
  is_anonymous = COALESCE(is_anonymous, false),
  raw_app_meta_data = COALESCE(raw_app_meta_data, '{"provider":"email","providers":["email"]}'::jsonb),
  raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb);

NOTIFY pgrst, 'reload schema';
