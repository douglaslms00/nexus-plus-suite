-- Anexo (foto/PDF do cupom) nos abastecimentos da frota.
-- Rode este arquivo no SQL Editor do Supabase (ou via `supabase db push`).
ALTER TABLE public.frota_abastecimentos
  ADD COLUMN IF NOT EXISTS anexo_url text;
