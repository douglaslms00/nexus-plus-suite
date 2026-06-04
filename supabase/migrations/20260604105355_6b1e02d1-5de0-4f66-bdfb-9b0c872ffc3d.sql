
-- Tabela de obras autorizadas por usuário
CREATE TABLE public.user_obras (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  obra_id UUID NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, obra_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_obras TO authenticated;
GRANT ALL ON public.user_obras TO service_role;

ALTER TABLE public.user_obras ENABLE ROW LEVEL SECURITY;

CREATE POLICY "uo_select_self_or_admin" ON public.user_obras FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "uo_admin_insert" ON public.user_obras FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "uo_admin_delete" ON public.user_obras FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_user_obras_user ON public.user_obras(user_id);
CREATE INDEX idx_user_obras_obra ON public.user_obras(obra_id);

-- Função para checar acesso a uma obra (admin/gestor têm acesso total)
CREATE OR REPLACE FUNCTION public.has_obra_access(_user_id UUID, _obra_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(_user_id, 'admin')
    OR public.has_role(_user_id, 'gestor')
    OR _obra_id IS NULL
    OR EXISTS (SELECT 1 FROM public.user_obras WHERE user_id = _user_id AND obra_id = _obra_id);
$$;

-- Atualizar políticas de SELECT para respeitar acesso por obra
DROP POLICY IF EXISTS "obras_sel" ON public.obras;
CREATE POLICY "obras_sel" ON public.obras FOR SELECT TO authenticated
  USING (public.has_obra_access(auth.uid(), id));

DROP POLICY IF EXISTS "funcionarios_select_admin_gestor" ON public.funcionarios;
CREATE POLICY "funcionarios_sel" ON public.funcionarios FOR SELECT TO authenticated
  USING (public.has_obra_access(auth.uid(), obra_id));

DROP POLICY IF EXISTS "fer_sel" ON public.ferramentas;
CREATE POLICY "fer_sel" ON public.ferramentas FOR SELECT TO authenticated
  USING (public.has_obra_access(auth.uid(), obra_id));

DROP POLICY IF EXISTS "ativos_sel" ON public.ativos;
CREATE POLICY "ativos_sel" ON public.ativos FOR SELECT TO authenticated
  USING (public.has_obra_access(auth.uid(), obra_id));

DROP POLICY IF EXISTS "mm_sel" ON public.material_movimentos;
CREATE POLICY "mm_sel" ON public.material_movimentos FOR SELECT TO authenticated
  USING (public.has_obra_access(auth.uid(), obra_id));

DROP POLICY IF EXISTS "cf_sel" ON public.contas_financeiras;
CREATE POLICY "cf_sel" ON public.contas_financeiras FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'gestor')
    OR public.has_role(auth.uid(), 'financeiro')
    OR user_id = auth.uid()
    OR public.has_obra_access(auth.uid(), obra_id)
  );
