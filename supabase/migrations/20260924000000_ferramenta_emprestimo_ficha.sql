-- Ficha de empréstimo de ferramentas: permite emprestar várias ferramentas
-- de uma vez para o mesmo colaborador, agrupadas por ficha_id.
-- Na devolução, é possível devolver um item específico ou toda a ficha.

ALTER TABLE public.ferramenta_emprestimos
  ADD COLUMN IF NOT EXISTS ficha_id uuid;

-- Backfill: cada empréstimo antigo vira sua própria ficha
UPDATE public.ferramenta_emprestimos
SET ficha_id = id
WHERE ficha_id IS NULL;

ALTER TABLE public.ferramenta_emprestimos
  ALTER COLUMN ficha_id SET DEFAULT gen_random_uuid();

CREATE INDEX IF NOT EXISTS idx_ferramenta_emprestimos_ficha
  ON public.ferramenta_emprestimos (ficha_id);

CREATE INDEX IF NOT EXISTS idx_ferramenta_emprestimos_func_aberto
  ON public.ferramenta_emprestimos (funcionario_id)
  WHERE data_devolucao IS NULL;
