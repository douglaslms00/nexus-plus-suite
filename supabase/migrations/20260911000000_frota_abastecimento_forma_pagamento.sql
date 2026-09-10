-- Meio de pagamento do abastecimento (Cartão Crédito/Débito, Dinheiro/PIX, Cartão Frota, Shell Box, Faturamento Direto)
ALTER TABLE public.frota_abastecimentos
  ADD COLUMN IF NOT EXISTS forma_pagamento text;

COMMENT ON COLUMN public.frota_abastecimentos.forma_pagamento IS 'Meio de pagamento: Cartão Crédito/Débito, Dinheiro/PIX, Cartão Frota, Shell Box, Faturamento Direto';

-- Garante permissão para o PostgREST expor a nova coluna
GRANT SELECT, INSERT, UPDATE, DELETE ON public.frota_abastecimentos TO authenticated;
GRANT ALL ON public.frota_abastecimentos TO service_role;

-- Força reload do schema cache do PostgREST
NOTIFY pgrst, 'reload schema';
