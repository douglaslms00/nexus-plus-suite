-- Agenda pessoal: compromissos do usuário exibidos junto aos vencimentos de tarefas.
-- Cada usuário enxerga e gerencia apenas os próprios compromissos (RLS por user_id).
-- O vínculo opcional com tarefas (tarefa_id) é apenas referência visual na UI.

CREATE TABLE IF NOT EXISTS public.compromissos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  titulo text NOT NULL CHECK (char_length(titulo) BETWEEN 2 AND 200),
  descricao text,
  data date NOT NULL,
  hora_inicio time,
  hora_fim time,
  tarefa_id uuid REFERENCES public.tarefas(id) ON DELETE SET NULL,
  concluido boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compromissos_user_data ON public.compromissos(user_id, data);
CREATE INDEX IF NOT EXISTS idx_compromissos_tarefa ON public.compromissos(tarefa_id);

-- updated_at automático
CREATE OR REPLACE FUNCTION public.touch_compromissos_updated()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_touch_compromissos_updated ON public.compromissos;
CREATE TRIGGER trg_touch_compromissos_updated
  BEFORE UPDATE ON public.compromissos
  FOR EACH ROW EXECUTE FUNCTION public.touch_compromissos_updated();

-- RLS: cada usuário acessa apenas os próprios compromissos
ALTER TABLE public.compromissos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "compromissos_owner" ON public.compromissos;
CREATE POLICY "compromissos_owner" ON public.compromissos
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
