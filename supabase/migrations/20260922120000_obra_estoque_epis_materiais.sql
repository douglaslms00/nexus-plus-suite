-- Migration: destino de obra no cadastro de EPIs, Materiais e movimentações de EPI.
-- Permite inventário separado por obra (NULL = geral/sem obra específica).
-- IMPORTANTE: rode este SQL no Supabase (Dashboard > SQL Editor) antes de usar
-- os campos de Obra nas telas de EPIs e Materiais.

ALTER TABLE public.epis
  ADD COLUMN IF NOT EXISTS obra_id uuid REFERENCES public.obras(id) ON DELETE SET NULL;

ALTER TABLE public.materiais
  ADD COLUMN IF NOT EXISTS obra_id uuid REFERENCES public.obras(id) ON DELETE SET NULL;

ALTER TABLE public.epi_movimentos
  ADD COLUMN IF NOT EXISTS obra_id uuid REFERENCES public.obras(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_epis_obra ON public.epis(obra_id);
CREATE INDEX IF NOT EXISTS idx_materiais_obra ON public.materiais(obra_id);
CREATE INDEX IF NOT EXISTS idx_epi_movimentos_obra ON public.epi_movimentos(obra_id);
