-- Adiciona coluna data_nascimento ao cadastro de funcionários
ALTER TABLE public.funcionarios
  ADD COLUMN IF NOT EXISTS data_nascimento date;