-- Adiciona colunas de data (emissão) de ASO, Férias e Folga ao cadastro de funcionários.
-- A validade já é controlada pelas colunas existentes vencimento_aso, vencimento_ferias e vencimento_folga_campo.
ALTER TABLE public.funcionarios
  ADD COLUMN IF NOT EXISTS data_aso date,
  ADD COLUMN IF NOT EXISTS data_ferias date,
  ADD COLUMN IF NOT EXISTS data_folga_campo date;
