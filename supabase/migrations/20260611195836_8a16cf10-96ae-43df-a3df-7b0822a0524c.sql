
-- =========================================================
-- 1. NOTIFICATIONS
-- =========================================================
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tipo text NOT NULL,
  titulo text NOT NULL,
  mensagem text,
  link text,
  ref_table text,
  ref_id uuid,
  lida boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user ON public.notifications(user_id, lida, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users see own notifications" ON public.notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "users update own notifications" ON public.notifications
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "users delete own notifications" ON public.notifications
  FOR DELETE TO authenticated USING (user_id = auth.uid());
-- Inserts only via SECURITY DEFINER helper

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;

CREATE OR REPLACE FUNCTION public.notify_user(
  _user_id uuid, _tipo text, _titulo text, _mensagem text,
  _link text, _ref_table text, _ref_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF _user_id IS NULL THEN RETURN; END IF;
  INSERT INTO public.notifications(user_id, tipo, titulo, mensagem, link, ref_table, ref_id)
  VALUES (_user_id, _tipo, _titulo, _mensagem, _link, _ref_table, _ref_id);
END $$;

-- =========================================================
-- 2. TAREFAS — atribuição com aceite/recusa
-- =========================================================
ALTER TABLE public.tarefas
  ADD COLUMN IF NOT EXISTS assigned_to uuid,
  ADD COLUMN IF NOT EXISTS assignment_status text NOT NULL DEFAULT 'nenhum',
  ADD COLUMN IF NOT EXISTS assignment_response_at timestamptz,
  ADD COLUMN IF NOT EXISTS assignment_response_note text;

CREATE OR REPLACE FUNCTION public.tarefas_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_titulo text; v_actor text;
BEGIN
  SELECT nome INTO v_actor FROM public.profiles WHERE id = auth.uid();
  v_titulo := COALESCE(NEW.titulo, 'Tarefa');

  IF TG_OP = 'INSERT' THEN
    IF NEW.assigned_to IS NOT NULL AND NEW.assigned_to <> COALESCE(NEW.created_by, auth.uid()) THEN
      PERFORM public.notify_user(NEW.assigned_to, 'tarefa_atribuida',
        'Nova tarefa atribuída',
        COALESCE(v_actor,'Alguém') || ' atribuiu: ' || v_titulo,
        '/tarefas', 'tarefas', NEW.id);
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to AND NEW.assigned_to IS NOT NULL
     AND NEW.assigned_to <> COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid) THEN
    PERFORM public.notify_user(NEW.assigned_to, 'tarefa_atribuida',
      'Nova tarefa atribuída',
      COALESCE(v_actor,'Alguém') || ' atribuiu: ' || v_titulo,
      '/tarefas', 'tarefas', NEW.id);
  END IF;

  IF NEW.assignment_status IS DISTINCT FROM OLD.assignment_status
     AND NEW.assignment_status IN ('aceita','recusada') THEN
    PERFORM public.notify_user(NEW.created_by,
      'tarefa_resposta_' || NEW.assignment_status,
      CASE WHEN NEW.assignment_status='aceita' THEN 'Tarefa aceita' ELSE 'Tarefa recusada' END,
      COALESCE(v_actor,'Usuário') || ' ' || NEW.assignment_status || ': ' || v_titulo,
      '/tarefas', 'tarefas', NEW.id);
  END IF;

  IF NEW.concluida = true AND OLD.concluida = false THEN
    PERFORM public.notify_user(NEW.created_by, 'tarefa_concluida',
      'Tarefa concluída',
      COALESCE(v_actor,'Usuário') || ' concluiu: ' || v_titulo,
      '/tarefas', 'tarefas', NEW.id);
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_tarefas_notify ON public.tarefas;
CREATE TRIGGER trg_tarefas_notify
AFTER INSERT OR UPDATE ON public.tarefas
FOR EACH ROW EXECUTE FUNCTION public.tarefas_notify();

-- =========================================================
-- 3. FINANCEIRO — escopo pessoal
-- =========================================================
ALTER TABLE public.contas_financeiras
  ADD COLUMN IF NOT EXISTS escopo text NOT NULL DEFAULT 'obra';

-- Drop e recria policies para suportar escopo
DROP POLICY IF EXISTS "contas_select" ON public.contas_financeiras;
DROP POLICY IF EXISTS "contas_insert" ON public.contas_financeiras;
DROP POLICY IF EXISTS "contas_update" ON public.contas_financeiras;
DROP POLICY IF EXISTS "contas_delete" ON public.contas_financeiras;

CREATE POLICY "contas_select" ON public.contas_financeiras FOR SELECT TO authenticated
USING (
  (escopo = 'pessoal' AND user_id = auth.uid())
  OR (escopo = 'obra' AND (
    public.is_admin_or_gestor(auth.uid())
    OR (obra_id IS NOT NULL AND public.has_obra_access(auth.uid(), obra_id))
    OR user_id = auth.uid()
  ))
);
CREATE POLICY "contas_insert" ON public.contas_financeiras FOR INSERT TO authenticated
WITH CHECK (
  (escopo = 'pessoal' AND user_id = auth.uid() AND created_by = auth.uid())
  OR (escopo = 'obra' AND (
    public.is_admin_or_gestor(auth.uid())
    OR (obra_id IS NOT NULL AND public.has_obra_access(auth.uid(), obra_id))
  ))
);
CREATE POLICY "contas_update" ON public.contas_financeiras FOR UPDATE TO authenticated
USING (
  (escopo = 'pessoal' AND user_id = auth.uid())
  OR (escopo = 'obra' AND (
    public.is_admin_or_gestor(auth.uid())
    OR (obra_id IS NOT NULL AND public.has_obra_access(auth.uid(), obra_id))
  ))
);
CREATE POLICY "contas_delete" ON public.contas_financeiras FOR DELETE TO authenticated
USING (
  (escopo = 'pessoal' AND user_id = auth.uid())
  OR (escopo = 'obra' AND (
    public.is_admin_or_gestor(auth.uid())
    OR (obra_id IS NOT NULL AND public.has_obra_access(auth.uid(), obra_id))
  ))
);

-- =========================================================
-- 4. DOCUMENTOS
-- =========================================================
CREATE TABLE public.documento_pastas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  parent_id uuid REFERENCES public.documento_pastas(id) ON DELETE CASCADE,
  escopo text NOT NULL CHECK (escopo IN ('obra','pessoal')),
  obra_id uuid,
  user_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pastas_obra ON public.documento_pastas(obra_id);
CREATE INDEX idx_pastas_user ON public.documento_pastas(user_id);

CREATE TABLE public.documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pasta_id uuid REFERENCES public.documento_pastas(id) ON DELETE SET NULL,
  nome text NOT NULL,
  storage_path text NOT NULL,
  mime text,
  tamanho bigint,
  escopo text NOT NULL CHECK (escopo IN ('obra','pessoal')),
  obra_id uuid,
  user_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_docs_pasta ON public.documentos(pasta_id);
CREATE INDEX idx_docs_obra ON public.documentos(obra_id);
CREATE INDEX idx_docs_user ON public.documentos(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.documento_pastas TO authenticated;
GRANT ALL ON public.documento_pastas TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documentos TO authenticated;
GRANT ALL ON public.documentos TO service_role;

ALTER TABLE public.documento_pastas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pastas_select" ON public.documento_pastas FOR SELECT TO authenticated
USING (
  (escopo='pessoal' AND user_id = auth.uid())
  OR (escopo='obra' AND obra_id IS NOT NULL AND public.has_obra_access(auth.uid(), obra_id))
  OR (escopo='obra' AND obra_id IS NULL AND public.is_admin_or_gestor(auth.uid()))
);
CREATE POLICY "pastas_insert" ON public.documento_pastas FOR INSERT TO authenticated
WITH CHECK (
  (escopo='pessoal' AND user_id = auth.uid() AND created_by = auth.uid())
  OR (escopo='obra' AND obra_id IS NOT NULL AND public.has_obra_access(auth.uid(), obra_id))
);
CREATE POLICY "pastas_update" ON public.documento_pastas FOR UPDATE TO authenticated
USING (
  (escopo='pessoal' AND user_id = auth.uid())
  OR (escopo='obra' AND obra_id IS NOT NULL AND public.has_obra_access(auth.uid(), obra_id))
);
CREATE POLICY "pastas_delete" ON public.documento_pastas FOR DELETE TO authenticated
USING (
  (escopo='pessoal' AND user_id = auth.uid())
  OR (escopo='obra' AND obra_id IS NOT NULL AND public.has_obra_access(auth.uid(), obra_id))
);

CREATE POLICY "docs_select" ON public.documentos FOR SELECT TO authenticated
USING (
  (escopo='pessoal' AND user_id = auth.uid())
  OR (escopo='obra' AND obra_id IS NOT NULL AND public.has_obra_access(auth.uid(), obra_id))
  OR (escopo='obra' AND obra_id IS NULL AND public.is_admin_or_gestor(auth.uid()))
);
CREATE POLICY "docs_insert" ON public.documentos FOR INSERT TO authenticated
WITH CHECK (
  (escopo='pessoal' AND user_id = auth.uid() AND created_by = auth.uid())
  OR (escopo='obra' AND obra_id IS NOT NULL AND public.has_obra_access(auth.uid(), obra_id))
);
CREATE POLICY "docs_update" ON public.documentos FOR UPDATE TO authenticated
USING (
  (escopo='pessoal' AND user_id = auth.uid())
  OR (escopo='obra' AND obra_id IS NOT NULL AND public.has_obra_access(auth.uid(), obra_id))
);
CREATE POLICY "docs_delete" ON public.documentos FOR DELETE TO authenticated
USING (
  (escopo='pessoal' AND user_id = auth.uid())
  OR (escopo='obra' AND obra_id IS NOT NULL AND public.has_obra_access(auth.uid(), obra_id))
);

-- Storage policies para documentos no bucket anexos
DROP POLICY IF EXISTS "docs_pessoais_select" ON storage.objects;
DROP POLICY IF EXISTS "docs_pessoais_write" ON storage.objects;
DROP POLICY IF EXISTS "docs_obra_select" ON storage.objects;
DROP POLICY IF EXISTS "docs_obra_write" ON storage.objects;

CREATE POLICY "docs_pessoais_select" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id='anexos' AND name LIKE ('documentos/pessoal/' || auth.uid()::text || '/%'));
CREATE POLICY "docs_pessoais_write" ON storage.objects FOR ALL TO authenticated
USING (bucket_id='anexos' AND name LIKE ('documentos/pessoal/' || auth.uid()::text || '/%'))
WITH CHECK (bucket_id='anexos' AND name LIKE ('documentos/pessoal/' || auth.uid()::text || '/%'));

CREATE POLICY "docs_obra_select" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id='anexos' AND name LIKE 'documentos/obra/%');
CREATE POLICY "docs_obra_write" ON storage.objects FOR ALL TO authenticated
USING (bucket_id='anexos' AND name LIKE 'documentos/obra/%')
WITH CHECK (bucket_id='anexos' AND name LIKE 'documentos/obra/%');

-- Storage policy para avatars de perfil
DROP POLICY IF EXISTS "avatars_self" ON storage.objects;
CREATE POLICY "avatars_self" ON storage.objects FOR ALL TO authenticated
USING (bucket_id='anexos' AND name LIKE ('avatars/' || auth.uid()::text || '/%'))
WITH CHECK (bucket_id='anexos' AND name LIKE ('avatars/' || auth.uid()::text || '/%'));

-- =========================================================
-- 5. PROFILES — avatar
-- =========================================================
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url text;

-- =========================================================
-- 6. SYSTEM ROLE LABELS — permitir renomear cargos do sistema
-- =========================================================
CREATE TABLE public.system_role_labels (
  role public.app_role PRIMARY KEY,
  label text NOT NULL,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.system_role_labels TO authenticated;
GRANT ALL ON public.system_role_labels TO service_role;
ALTER TABLE public.system_role_labels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "system_role_labels_select" ON public.system_role_labels
  FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.admin_set_system_role_label(_role public.app_role, _label text, _description text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Apenas admin'; END IF;
  INSERT INTO public.system_role_labels(role, label, description, updated_at)
  VALUES (_role, _label, _description, now())
  ON CONFLICT (role) DO UPDATE SET label=EXCLUDED.label, description=EXCLUDED.description, updated_at=now();
END $$;

-- =========================================================
-- 7. Módulo 'documentos' nos cargos default
-- =========================================================
CREATE OR REPLACE FUNCTION public.seed_default_perms_for_role(_custom_role_id uuid, _template app_role)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  modules text[] := ARRAY['dashboard','funcionarios','tarefas','obras','ativos','ferramentas','materiais','epis','financeiro','documentos','acessos'];
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
      v_view := m IN ('dashboard','tarefas','funcionarios','epis','documentos');
      v_edit := false; v_delete := false;
    END IF;
    INSERT INTO public.custom_role_module_permissions (custom_role_id, module, can_view, can_edit, can_delete)
    VALUES (_custom_role_id, m, v_view, v_edit, v_delete)
    ON CONFLICT (custom_role_id, module) DO UPDATE
      SET can_view = EXCLUDED.can_view, can_edit = EXCLUDED.can_edit, can_delete = EXCLUDED.can_delete;
  END LOOP;
END $function$;
