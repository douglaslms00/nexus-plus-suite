-- Transferências de ferramentas entre obras (uma ou várias por lote).
-- Histórico auditável: 1 linha por ferramenta, agrupadas por lote_id.
-- A transferência efetiva é o UPDATE de ferramentas.obra_id feito pelo app;
-- esta tabela guarda origem/destino/motivo/responsável.

CREATE TABLE IF NOT EXISTS public.ferramenta_transferencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lote_id uuid NOT NULL DEFAULT gen_random_uuid(),
  ferramenta_id uuid NOT NULL REFERENCES public.ferramentas(id) ON DELETE CASCADE,
  obra_origem_id uuid REFERENCES public.obras(id) ON DELETE SET NULL,
  obra_destino_id uuid REFERENCES public.obras(id) ON DELETE SET NULL,
  motivo text,
  solicitado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ferramenta_transf_ferramenta ON public.ferramenta_transferencias(ferramenta_id);
CREATE INDEX IF NOT EXISTS idx_ferramenta_transf_lote ON public.ferramenta_transferencias(lote_id);
CREATE INDEX IF NOT EXISTS idx_ferramenta_transf_origem ON public.ferramenta_transferencias(obra_origem_id);
CREATE INDEX IF NOT EXISTS idx_ferramenta_transf_destino ON public.ferramenta_transferencias(obra_destino_id);
CREATE INDEX IF NOT EXISTS idx_ferramenta_transf_created ON public.ferramenta_transferencias(created_at DESC);

ALTER TABLE public.ferramenta_transferencias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_authenticated" ON public.ferramenta_transferencias;
CREATE POLICY "allow_all_authenticated" ON public.ferramenta_transferencias
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
