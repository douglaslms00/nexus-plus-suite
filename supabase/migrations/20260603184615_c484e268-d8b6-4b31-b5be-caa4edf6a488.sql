ALTER TABLE public.funcionarios
  ADD COLUMN IF NOT EXISTS validade_meses_treinamento integer,
  ADD COLUMN IF NOT EXISTS vencimento_experiencia date,
  ADD COLUMN IF NOT EXISTS validade_meses_experiencia integer;