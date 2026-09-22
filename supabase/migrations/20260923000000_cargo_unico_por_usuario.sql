-- Migration: cargo único por usuário
-- Regra: cada usuário possui no MÁXIMO 1 cargo (sistema OU personalizado).
-- 1) Nova RPC admin_set_user_cargo: troca atômica (apaga demais e insere o escolhido).
-- 2) Redefine admin_set_role / admin_bulk_set_custom_role para comportamento
--    exclusivo no _grant=TRUE (compatível com chamadas antigas do frontend).

-- 1) Troca atômica de cargo (única fonte de verdade para o frontend)
CREATE OR REPLACE FUNCTION public.admin_set_user_cargo(
  _user_id   uuid,
  _cargo_key TEXT DEFAULT NULL -- 'sys:<app_role>' | 'cus:<uuid>' | NULL (remove todos)
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id uuid;
  v_sys_role  TEXT;
  v_custom_id uuid;
BEGIN
  v_caller_id := auth.uid();
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = v_caller_id AND role IN ('admin', 'gestor')
  ) THEN
    RAISE EXCEPTION 'Permissao negada: apenas administradores e gestores podem alterar cargos.';
  END IF;

  -- Limpa todos os cargos atuais (sistema + personalizados)
  DELETE FROM public.user_roles WHERE user_id = _user_id;
  DELETE FROM public.user_custom_roles WHERE user_id = _user_id;

  IF _cargo_key IS NULL OR _cargo_key = '' OR _cargo_key = 'none' THEN
    RETURN;
  END IF;

  IF _cargo_key LIKE 'sys:%' THEN
    v_sys_role := substring(_cargo_key FROM 5);
    IF v_sys_role NOT IN ('admin', 'gestor', 'financeiro', 'colaborador') THEN
      RAISE EXCEPTION 'Cargo do sistema invalido: %', v_sys_role;
    END IF;
    INSERT INTO public.user_roles (user_id, role)
    VALUES (_user_id, v_sys_role::public.app_role)
    ON CONFLICT DO NOTHING;
  ELSIF _cargo_key LIKE 'cus:%' THEN
    v_custom_id := (substring(_cargo_key FROM 5))::uuid;
    IF NOT EXISTS (SELECT 1 FROM public.custom_roles WHERE id = v_custom_id) THEN
      RAISE EXCEPTION 'Cargo personalizado nao encontrado.';
    END IF;
    INSERT INTO public.user_custom_roles (user_id, custom_role_id)
    VALUES (_user_id, v_custom_id)
    ON CONFLICT DO NOTHING;
  ELSE
    RAISE EXCEPTION 'Formato de cargo invalido. Use sys:<role> ou cus:<uuid>.';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_user_cargo(uuid, TEXT) TO authenticated;

-- 2a) admin_set_role passa a ser exclusivo: conceder um cargo remove os demais
CREATE OR REPLACE FUNCTION public.admin_set_role(
  _user_id uuid,
  _role    public.app_role,
  _grant   boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role IN ('admin', 'gestor')
  ) THEN
    RAISE EXCEPTION 'Permissao negada: apenas administradores e gestores podem alterar cargos.';
  END IF;

  IF _grant THEN
    -- Cargo único: limpa tudo antes de atribuir
    DELETE FROM public.user_roles WHERE user_id = _user_id;
    DELETE FROM public.user_custom_roles WHERE user_id = _user_id;
    INSERT INTO public.user_roles (user_id, role)
    VALUES (_user_id, _role)
    ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.user_roles WHERE user_id = _user_id AND role = _role;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_role(uuid, public.app_role, boolean) TO authenticated;

-- 2b) bulk custom: conceder substitui o cargo atual de cada usuário
CREATE OR REPLACE FUNCTION public.admin_bulk_set_custom_role(
  _user_ids       uuid[],
  _custom_role_id uuid,
  _grant          boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role IN ('admin', 'gestor')
  ) THEN
    RAISE EXCEPTION 'Permissao negada: apenas administradores e gestores podem alterar cargos.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.custom_roles WHERE id = _custom_role_id) THEN
    RAISE EXCEPTION 'Cargo personalizado nao encontrado.';
  END IF;

  FOREACH v_uid IN ARRAY _user_ids
  LOOP
    IF _grant THEN
      DELETE FROM public.user_roles WHERE user_id = v_uid;
      DELETE FROM public.user_custom_roles WHERE user_id = v_uid;
      INSERT INTO public.user_custom_roles (user_id, custom_role_id)
      VALUES (v_uid, _custom_role_id)
      ON CONFLICT DO NOTHING;
    ELSE
      DELETE FROM public.user_custom_roles
      WHERE user_id = v_uid AND custom_role_id = _custom_role_id;
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_bulk_set_custom_role(uuid[], uuid, boolean) TO authenticated;

-- 2c) Normaliza criação: garante que admin_create_user_login já cria com 1 cargo só.
-- (A função já insere apenas 1 registro; aqui só garantimos que o trigger
--  handle_new_user não duplique quando a RPC já definiu um cargo.)
-- handle_new_user já checa NOT EXISTS nas duas tabelas, então nada a mudar.

NOTIFY pgrst, 'reload schema';
