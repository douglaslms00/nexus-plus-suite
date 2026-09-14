-- Migration: admin_create_user_login
-- Permite que admins e gestores criem logins de acesso para novos usuários
-- diretamente pela tela de Acessos, sem necessidade de auto-cadastro.

-- Função RPC para criar um novo usuário (chamada pelo frontend como admin)
-- Requer que a extensão pgcrypto esteja disponível (já é padrão no Supabase).
CREATE OR REPLACE FUNCTION public.admin_create_user_login(
  _email       TEXT,
  _password    TEXT,
  _nome        TEXT,
  _is_admin    BOOLEAN DEFAULT FALSE,
  _cargo_key   TEXT    DEFAULT NULL   -- ex: 'sys:colaborador' ou 'cus:<uuid>'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id    uuid;
  v_caller_id  uuid;
  v_caller_role TEXT;
  v_sys_role   TEXT;
  v_custom_id  uuid;
BEGIN
  -- Verifica se o chamador é admin ou gestor
  v_caller_id := auth.uid();
  SELECT role INTO v_caller_role
  FROM public.user_roles
  WHERE user_id = v_caller_id AND role IN ('admin', 'gestor')
  LIMIT 1;

  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'Permissao negada: apenas administradores e gestores podem criar usuarios.';
  END IF;

  -- Apenas admin pode marcar outro usuário como admin
  IF _is_admin = TRUE AND v_caller_role != 'admin' THEN
    RAISE EXCEPTION 'Permissao negada: apenas administradores podem criar outros administradores.';
  END IF;

  -- Cria o usuário no auth.users
  -- Usa email_confirmed_at para pular verificação de e-mail
  INSERT INTO auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    role,
    aud,
    created_at,
    updated_at
  )
  VALUES (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000000',
    _email,
    crypt(_password, gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('nome', _nome),
    'authenticated',
    'authenticated',
    now(),
    now()
  )
  RETURNING id INTO v_user_id;

  -- Cria o perfil
  INSERT INTO public.profiles (id, nome, created_at, updated_at)
  VALUES (v_user_id, _nome, now(), now())
  ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome;

  -- Atribui cargo do sistema se solicitado
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

-- Concede execução apenas a usuários autenticados
GRANT EXECUTE ON FUNCTION public.admin_create_user_login(TEXT, TEXT, TEXT, BOOLEAN, TEXT) TO authenticated;
