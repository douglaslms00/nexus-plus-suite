-- Migration: novo_colaborador_default_role.sql
-- Garante que todo novo usuário criado (via admin_create_user_login, signUp ou trigger)
-- receba por padrão o cargo 'colaborador' ("Novo Colaborador") até que suas permissões sejam alteradas.

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

  -- Todo novo usuário recebe o cargo padrão 'colaborador' (Novo Colaborador)
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = NEW.id) AND
     NOT EXISTS (SELECT 1 FROM public.user_custom_roles WHERE user_id = NEW.id) THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'colaborador') ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
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

  SELECT id INTO v_instance_id FROM auth.instances LIMIT 1;
  IF v_instance_id IS NULL THEN
    v_instance_id := '00000000-0000-0000-0000-000000000000';
  END IF;

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
    NULL, NULL, '', '', NULL, '', NULL,
    '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('nome', _nome),
    FALSE, FALSE, FALSE, now(), now()
  )
  RETURNING id INTO v_user_id;

  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at, provider_id
  )
  VALUES (
    gen_random_uuid(), v_user_id, jsonb_build_object('sub', v_user_id::text, 'email', lower(_email)),
    'email', now(), now(), now(), v_user_id::text
  )
  ON CONFLICT DO NOTHING;

  INSERT INTO public.profiles (id, nome, email, created_at, updated_at)
  VALUES (v_user_id, _nome, _email, now(), now())
  ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, email = EXCLUDED.email;

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
  ELSE
    -- Se nenhum cargo for especificado, atribui 'colaborador' (Novo Colaborador) por padrão
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_user_id, 'colaborador')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN v_user_id;
END;
$$;

NOTIFY pgrst, 'reload schema';
