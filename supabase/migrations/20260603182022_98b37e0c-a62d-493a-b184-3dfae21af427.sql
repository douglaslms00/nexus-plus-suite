CREATE TABLE public.tarefa_execucoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tarefa_id UUID NOT NULL REFERENCES public.tarefas(id) ON DELETE CASCADE,
  executor_id UUID,
  executor_nome TEXT,
  executado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  observacao TEXT,
  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tarefa_execucoes TO authenticated;
GRANT ALL ON public.tarefa_execucoes TO service_role;

ALTER TABLE public.tarefa_execucoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "exec_select" ON public.tarefa_execucoes FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.tarefas t
    WHERE t.id = tarefa_id
      AND (t.responsavel_id = auth.uid() OR t.created_by = auth.uid() OR public.is_admin_or_gestor(auth.uid()))
  )
);

CREATE POLICY "exec_insert" ON public.tarefa_execucoes FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.tarefas t
    WHERE t.id = tarefa_id
      AND (t.responsavel_id = auth.uid() OR public.is_admin_or_gestor(auth.uid()))
  )
);

CREATE POLICY "exec_update" ON public.tarefa_execucoes FOR UPDATE TO authenticated
USING (created_by = auth.uid() OR public.is_admin_or_gestor(auth.uid()));

CREATE POLICY "exec_delete" ON public.tarefa_execucoes FOR DELETE TO authenticated
USING (created_by = auth.uid() OR public.is_admin_or_gestor(auth.uid()));

CREATE TRIGGER tarefa_execucoes_touch BEFORE UPDATE ON public.tarefa_execucoes
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();