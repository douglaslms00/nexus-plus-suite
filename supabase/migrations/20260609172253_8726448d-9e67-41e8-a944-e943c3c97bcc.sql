
-- 1) Parent role (inheritance reference, used at creation time to seed perms)
ALTER TABLE public.custom_roles ADD COLUMN IF NOT EXISTS parent_role_id uuid REFERENCES public.custom_roles(id) ON DELETE SET NULL;
ALTER TABLE public.custom_roles ADD COLUMN IF NOT EXISTS template_role app_role;

-- 2) Audit log
CREATE TABLE IF NOT EXISTS public.permission_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid,
  actor_email text,
  action text NOT NULL,           -- e.g. 'role_grant','role_revoke','custom_role_assign','custom_role_unassign','override_set','override_clear','custom_role_perm_set','custom_role_created','custom_role_deleted','custom_role_updated'
  target_user_id uuid,
  custom_role_id uuid,
  module text,
  details jsonb
);

GRANT SELECT ON public.permission_audit_log TO authenticated;
GRANT ALL ON public.permission_audit_log TO service_role;

ALTER TABLE public.permission_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin reads audit log" ON public.permission_audit_log;
CREATE POLICY "Admin reads audit log" ON public.permission_audit_log
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Inserts only via SECURITY DEFINER helper
DROP POLICY IF EXISTS "No direct insert audit" ON public.permission_audit_log;
CREATE POLICY "No direct insert audit" ON public.permission_audit_log
  FOR INSERT TO authenticated WITH CHECK (false);

CREATE INDEX IF NOT EXISTS permission_audit_log_created_at_idx ON public.permission_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS permission_audit_log_target_idx ON public.permission_audit_log (target_user_id);

-- helper to write audit rows
CREATE OR REPLACE FUNCTION public.log_permission_change(
  _action text,
  _target_user_id uuid,
  _custom_role_id uuid,
  _module text,
  _details jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_email text;
BEGIN
  SELECT email INTO v_email FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.permission_audit_log (actor_id, actor_email, action, target_user_id, custom_role_id, module, details)
  VALUES (auth.uid(), v_email, _action, _target_user_id, _custom_role_id, _module, _details);
END $$;

-- 3) Triggers on permission tables
CREATE OR REPLACE FUNCTION public.audit_user_roles() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_permission_change('role_grant', NEW.user_id, NULL, NULL, jsonb_build_object('role', NEW.role));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.log_permission_change('role_revoke', OLD.user_id, NULL, NULL, jsonb_build_object('role', OLD.role));
    RETURN OLD;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_audit_user_roles ON public.user_roles;
CREATE TRIGGER trg_audit_user_roles AFTER INSERT OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.audit_user_roles();

CREATE OR REPLACE FUNCTION public.audit_user_custom_roles() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_label text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT label INTO v_label FROM public.custom_roles WHERE id = NEW.custom_role_id;
    PERFORM public.log_permission_change('custom_role_assign', NEW.user_id, NEW.custom_role_id, NULL, jsonb_build_object('label', v_label));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT label INTO v_label FROM public.custom_roles WHERE id = OLD.custom_role_id;
    PERFORM public.log_permission_change('custom_role_unassign', OLD.user_id, OLD.custom_role_id, NULL, jsonb_build_object('label', v_label));
    RETURN OLD;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_audit_user_custom_roles ON public.user_custom_roles;
CREATE TRIGGER trg_audit_user_custom_roles AFTER INSERT OR DELETE ON public.user_custom_roles
  FOR EACH ROW EXECUTE FUNCTION public.audit_user_custom_roles();

CREATE OR REPLACE FUNCTION public.audit_user_module_permissions() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.log_permission_change('override_clear', OLD.user_id, NULL, OLD.module, NULL);
    RETURN OLD;
  ELSE
    PERFORM public.log_permission_change('override_set', NEW.user_id, NULL, NEW.module,
      jsonb_build_object('can_view', NEW.can_view, 'can_edit', NEW.can_edit, 'can_delete', NEW.can_delete));
    RETURN NEW;
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_audit_user_module_permissions ON public.user_module_permissions;
CREATE TRIGGER trg_audit_user_module_permissions AFTER INSERT OR UPDATE OR DELETE ON public.user_module_permissions
  FOR EACH ROW EXECUTE FUNCTION public.audit_user_module_permissions();

CREATE OR REPLACE FUNCTION public.audit_custom_role_perms() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.log_permission_change('custom_role_perm_clear', NULL, OLD.custom_role_id, OLD.module, NULL);
    RETURN OLD;
  ELSE
    PERFORM public.log_permission_change('custom_role_perm_set', NULL, NEW.custom_role_id, NEW.module,
      jsonb_build_object('can_view', NEW.can_view, 'can_edit', NEW.can_edit, 'can_delete', NEW.can_delete));
    RETURN NEW;
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_audit_custom_role_perms ON public.custom_role_module_permissions;
CREATE TRIGGER trg_audit_custom_role_perms AFTER INSERT OR UPDATE OR DELETE ON public.custom_role_module_permissions
  FOR EACH ROW EXECUTE FUNCTION public.audit_custom_role_perms();

CREATE OR REPLACE FUNCTION public.audit_custom_roles() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_permission_change('custom_role_created', NULL, NEW.id, NULL,
      jsonb_build_object('label', NEW.label, 'name', NEW.name, 'parent_role_id', NEW.parent_role_id, 'template_role', NEW.template_role));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.log_permission_change('custom_role_deleted', NULL, OLD.id, NULL,
      jsonb_build_object('label', OLD.label, 'name', OLD.name));
    RETURN OLD;
  ELSE
    PERFORM public.log_permission_change('custom_role_updated', NULL, NEW.id, NULL,
      jsonb_build_object('label', NEW.label, 'name', NEW.name, 'description', NEW.description));
    RETURN NEW;
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_audit_custom_roles ON public.custom_roles;
CREATE TRIGGER trg_audit_custom_roles AFTER INSERT OR UPDATE OR DELETE ON public.custom_roles
  FOR EACH ROW EXECUTE FUNCTION public.audit_custom_roles();

-- 4) Default-permission seeder mirroring frontend defaults
CREATE OR REPLACE FUNCTION public.seed_default_perms_for_role(_custom_role_id uuid, _template app_role)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  modules text[] := ARRAY['dashboard','funcionarios','tarefas','obras','ativos','ferramentas','materiais','epis','financeiro','acessos'];
  m text;
  v_view bool; v_edit bool; v_delete bool;
BEGIN
  FOREACH m IN ARRAY modules LOOP
    IF _template = 'admin' THEN
      v_view := true; v_edit := true; v_delete := true;
    ELSIF m = 'acessos' THEN
      v_view := false; v_edit := false; v_delete := false;
    ELSIF _template = 'gestor' THEN
      v_view := true; v_edit := true; v_delete := false;
    ELSIF _template = 'financeiro' THEN
      IF m = 'financeiro' THEN
        v_view := true; v_edit := true; v_delete := false;
      ELSE
        v_view := true; v_edit := false; v_delete := false;
      END IF;
    ELSE -- colaborador
      v_view := m IN ('dashboard','tarefas','funcionarios','epis');
      v_edit := false; v_delete := false;
    END IF;
    INSERT INTO public.custom_role_module_permissions (custom_role_id, module, can_view, can_edit, can_delete)
    VALUES (_custom_role_id, m, v_view, v_edit, v_delete)
    ON CONFLICT (custom_role_id, module) DO UPDATE
      SET can_view = EXCLUDED.can_view, can_edit = EXCLUDED.can_edit, can_delete = EXCLUDED.can_delete;
  END LOOP;
END $$;

-- 5) Create custom role from template
CREATE OR REPLACE FUNCTION public.admin_create_custom_role_from_template(
  _name text, _label text, _description text, _template app_role
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Apenas admin'; END IF;
  INSERT INTO public.custom_roles (name, label, description, template_role)
  VALUES (_name, _label, _description, _template) RETURNING id INTO v_id;
  PERFORM public.seed_default_perms_for_role(v_id, _template);
  RETURN v_id;
END $$;

-- 6) Create custom role inheriting from another custom role
CREATE OR REPLACE FUNCTION public.admin_create_custom_role_inherit(
  _name text, _label text, _description text, _parent_id uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Apenas admin'; END IF;
  INSERT INTO public.custom_roles (name, label, description, parent_role_id)
  VALUES (_name, _label, _description, _parent_id) RETURNING id INTO v_id;
  INSERT INTO public.custom_role_module_permissions (custom_role_id, module, can_view, can_edit, can_delete)
  SELECT v_id, module, can_view, can_edit, can_delete
  FROM public.custom_role_module_permissions WHERE custom_role_id = _parent_id;
  RETURN v_id;
END $$;

-- 7) Update label/description/name
CREATE OR REPLACE FUNCTION public.admin_update_custom_role(
  _id uuid, _name text, _label text, _description text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Apenas admin'; END IF;
  UPDATE public.custom_roles
    SET name = COALESCE(_name, name),
        label = COALESCE(_label, label),
        description = COALESCE(_description, description),
        updated_at = now()
    WHERE id = _id;
END $$;

-- 8) Bulk assign / unassign
CREATE OR REPLACE FUNCTION public.admin_bulk_set_custom_role(
  _user_ids uuid[], _custom_role_id uuid, _grant boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE u uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Apenas admin'; END IF;
  IF _grant THEN
    FOREACH u IN ARRAY _user_ids LOOP
      INSERT INTO public.user_custom_roles (user_id, custom_role_id)
      VALUES (u, _custom_role_id) ON CONFLICT DO NOTHING;
    END LOOP;
  ELSE
    DELETE FROM public.user_custom_roles
      WHERE custom_role_id = _custom_role_id AND user_id = ANY(_user_ids);
  END IF;
END $$;
