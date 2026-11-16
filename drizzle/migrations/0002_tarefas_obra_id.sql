ALTER TABLE public.tarefas ADD COLUMN IF NOT EXISTS obra_id uuid REFERENCES public.obras(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS tarefas_obra_id_idx ON public.tarefas(obra_id);