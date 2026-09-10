-- Anexo (nota/cupom fiscal) do abastecimento — armazena o path no bucket "anexos" do Storage
ALTER TABLE public.frota_abastecimentos
  ADD COLUMN IF NOT EXISTS comprovante_url text;

COMMENT ON COLUMN public.frota_abastecimentos.comprovante_url IS 'Path do comprovante (imagem ou PDF) no bucket anexos do Storage';
