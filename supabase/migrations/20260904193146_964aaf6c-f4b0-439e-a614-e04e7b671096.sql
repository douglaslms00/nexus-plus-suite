ALTER TABLE public.funcionarios
  ADD COLUMN IF NOT EXISTS data_aso date,
  ADD COLUMN IF NOT EXISTS data_folga_campo date,
  ADD COLUMN IF NOT EXISTS data_ferias date,
  ADD COLUMN IF NOT EXISTS data_experiencia date;