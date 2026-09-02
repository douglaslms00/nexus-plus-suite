CREATE TABLE public.funcionario_treinamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funcionario_id uuid NOT NULL REFERENCES public.funcionarios(id) ON DELETE CASCADE,
  nome text NOT NULL,
  data_realizacao date,
  data_validade date,
  observacoes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.funcionario_treinamentos TO authenticated;
GRANT ALL ON public.funcionario_treinamentos TO service_role;

ALTER TABLE public.funcionario_treinamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ft_select" ON public.funcionario_treinamentos FOR SELECT TO authenticated
  USING (public.can_module(auth.uid(), 'funcionarios', 'view'));
CREATE POLICY "ft_insert" ON public.funcionario_treinamentos FOR INSERT TO authenticated
  WITH CHECK (public.can_module(auth.uid(), 'funcionarios', 'edit'));
CREATE POLICY "ft_update" ON public.funcionario_treinamentos FOR UPDATE TO authenticated
  USING (public.can_module(auth.uid(), 'funcionarios', 'edit'))
  WITH CHECK (public.can_module(auth.uid(), 'funcionarios', 'edit'));
CREATE POLICY "ft_delete" ON public.funcionario_treinamentos FOR DELETE TO authenticated
  USING (public.can_module(auth.uid(), 'funcionarios', 'edit'));

CREATE INDEX idx_ft_funcionario ON public.funcionario_treinamentos(funcionario_id);

CREATE TRIGGER ft_touch BEFORE UPDATE ON public.funcionario_treinamentos
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();