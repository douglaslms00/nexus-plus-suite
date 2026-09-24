-- Garante a tabela public.frota_termos no banco remoto.
-- A migration original (20260917120000) pode não ter sido aplicada ao projeto
-- (erro "Could not find the table 'public.frota_termos' in the schema cache"),
-- e além disso ela não concedia GRANTs para authenticated/service_role.
-- Este arquivo é idempotente: pode ser aplicado com segurança várias vezes.

CREATE TABLE IF NOT EXISTS public.frota_termos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_termo date NOT NULL DEFAULT current_date,
  veiculo_id uuid NOT NULL REFERENCES public.frota_veiculos(id) ON DELETE CASCADE,
  motorista_id uuid NOT NULL REFERENCES public.frota_motoristas(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'ativo', -- ativo, encerrado, pendente_assinatura
  anexo_url text,
  observacoes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_frota_termos_veiculo ON public.frota_termos(veiculo_id);
CREATE INDEX IF NOT EXISTS idx_frota_termos_motorista ON public.frota_termos(motorista_id);
CREATE INDEX IF NOT EXISTS idx_frota_termos_data ON public.frota_termos(data_termo);

ALTER TABLE public.frota_termos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_authenticated" ON public.frota_termos;
CREATE POLICY "allow_all_authenticated" ON public.frota_termos FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.frota_termos TO authenticated;
GRANT ALL ON public.frota_termos TO service_role;

DROP TRIGGER IF EXISTS trg_touch_frota_termos ON public.frota_termos;
CREATE TRIGGER trg_touch_frota_termos BEFORE UPDATE ON public.frota_termos FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Força o PostgREST a recarregar o schema cache (elimina o erro "schema cache").
NOTIFY pgrst, 'reload schema';
