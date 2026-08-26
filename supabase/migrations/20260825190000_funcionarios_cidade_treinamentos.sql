-- Garante colunas endereco e cidade na tabela funcionarios
ALTER TABLE public.funcionarios
  ADD COLUMN IF NOT EXISTS endereco text,
  ADD COLUMN IF NOT EXISTS cidade text;

-- Tabela de treinamentos dinamicos por funcionario
CREATE TABLE IF NOT EXISTS public.funcionario_treinamentos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funcionario_id  uuid NOT NULL REFERENCES public.funcionarios(id) ON DELETE CASCADE,
  nome            text NOT NULL,
  data_realizacao date,
  data_validade   date,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.funcionario_treinamentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS func_trein_sel ON public.funcionario_treinamentos;
CREATE POLICY func_trein_sel ON public.funcionario_treinamentos
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS func_trein_ins ON public.funcionario_treinamentos;
CREATE POLICY func_trein_ins ON public.funcionario_treinamentos
  FOR INSERT TO authenticated WITH CHECK (public.can_module(auth.uid(), 'funcionarios', 'edit'));

DROP POLICY IF EXISTS func_trein_upd ON public.funcionario_treinamentos;
CREATE POLICY func_trein_upd ON public.funcionario_treinamentos
  FOR UPDATE TO authenticated USING (public.can_module(auth.uid(), 'funcionarios', 'edit'));

DROP POLICY IF EXISTS func_trein_del ON public.funcionario_treinamentos;
CREATE POLICY func_trein_del ON public.funcionario_treinamentos
  FOR DELETE TO authenticated USING (public.can_module(auth.uid(), 'funcionarios', 'delete'));
