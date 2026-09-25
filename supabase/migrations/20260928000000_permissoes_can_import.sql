-- Permissão granular de importação de dados (CSV).
-- Somente usuários/cargos com can_import = true veem o botão "Importar CSV"
-- e conseguem concluir a importação. Admin sempre tem acesso (regra no frontend).
-- Padrão: false (opt-in explícito pelo gestor/admin na tela Acessos).

ALTER TABLE public.user_module_permissions
  ADD COLUMN IF NOT EXISTS can_import boolean NOT NULL DEFAULT false;

ALTER TABLE public.custom_role_module_permissions
  ADD COLUMN IF NOT EXISTS can_import boolean NOT NULL DEFAULT false;

ALTER TABLE public.system_role_module_permissions
  ADD COLUMN IF NOT EXISTS can_import boolean NOT NULL DEFAULT false;

-- RPC de escrita das permissões de cargos do sistema passa a aceitar _can_import.
-- Mantém compatibilidade: parâmetro com DEFAULT false, então chamadas antigas
-- (5 args) continuam funcionando; chamadas novas enviam 6 args.
DROP FUNCTION IF EXISTS public.admin_set_system_role_perm(app_role, text, boolean, boolean, boolean);

CREATE OR REPLACE FUNCTION public.admin_set_system_role_perm(
  _role app_role,
  _module text,
  _can_view boolean,
  _can_edit boolean,
  _can_delete boolean,
  _can_import boolean DEFAULT false
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  -- Somente admin/gestor pode alterar permissões do sistema.
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor')) THEN
    RAISE EXCEPTION 'Sem permissão para alterar permissões do sistema';
  END IF;
  UPDATE public.system_role_module_permissions
  SET can_view = _can_view,
      can_edit = _can_edit,
      can_delete = _can_delete,
      can_import = COALESCE(_can_import, false),
      updated_at = now()
  WHERE role = _role AND module = _module;
  IF NOT FOUND THEN
    BEGIN
      INSERT INTO public.system_role_module_permissions (role, module, can_view, can_edit, can_delete, can_import, updated_at)
      VALUES (_role, _module, _can_view, _can_edit, _can_delete, COALESCE(_can_import, false), now());
    EXCEPTION WHEN unique_violation THEN
      UPDATE public.system_role_module_permissions
      SET can_view = _can_view,
          can_edit = _can_edit,
          can_delete = _can_delete,
          can_import = COALESCE(_can_import, false),
          updated_at = now()
      WHERE role = _role AND module = _module;
    END;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.admin_set_system_role_perm(app_role, text, boolean, boolean, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_system_role_perm(app_role, text, boolean, boolean, boolean, boolean) TO authenticated;
