-- Gestão de Frota — 6 tabelas + RLS + índices
-- Veículos, Motoristas, Abastecimentos, Manutenções, Gastos Avulsos, Pedágios

-- 1) VEÍCULOS
CREATE TABLE IF NOT EXISTS public.frota_veiculos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  placa text NOT NULL,
  modelo text NOT NULL,
  marca text,
  ano integer,
  cor text,
  chassi text,
  renavam text,
  tipo text NOT NULL DEFAULT 'leve', -- leve, pesado, van, caminhao, maquina
  combustivel_padrao text NOT NULL DEFAULT 'diesel', -- gasolina, etanol, diesel, flex, gnv, eletrico
  odometro_atual integer NOT NULL DEFAULT 0,
  odometro_proxima_revisao integer,
  data_proxima_revisao date,
  intervalo_revisao_km integer NOT NULL DEFAULT 10000,
  intervalo_revisao_meses integer NOT NULL DEFAULT 6,
  status text NOT NULL DEFAULT 'ativo', -- ativo, manutencao, inativo, vendido
  obra_id uuid REFERENCES public.obras(id) ON DELETE SET NULL,
  observacoes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_frota_veiculos_placa ON public.frota_veiculos (upper(placa));
CREATE INDEX IF NOT EXISTS idx_frota_veiculos_obra ON public.frota_veiculos(obra_id);
CREATE INDEX IF NOT EXISTS idx_frota_veiculos_status ON public.frota_veiculos(status);

-- 2) MOTORISTAS
CREATE TABLE IF NOT EXISTS public.frota_motoristas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  cpf text,
  cnh_numero text,
  cnh_categoria text NOT NULL DEFAULT 'B', -- A,B,C,D,E,AB,AC,AD,AE
  cnh_validade date,
  telefone text,
  email text,
  status text NOT NULL DEFAULT 'ativo', -- ativo, inativo, afastado
  observacoes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_frota_motoristas_cpf ON public.frota_motoristas ((regexp_replace(cpf,'[^0-9]','','g'))) WHERE cpf IS NOT NULL AND btrim(cpf) <> '';
CREATE INDEX IF NOT EXISTS idx_frota_motoristas_status ON public.frota_motoristas(status);
CREATE INDEX IF NOT EXISTS idx_frota_motoristas_cnh_validade ON public.frota_motoristas(cnh_validade);

-- 3) ABASTECIMENTOS
CREATE TABLE IF NOT EXISTS public.frota_abastecimentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data date NOT NULL DEFAULT current_date,
  veiculo_id uuid NOT NULL REFERENCES public.frota_veiculos(id) ON DELETE CASCADE,
  motorista_id uuid REFERENCES public.frota_motoristas(id) ON DELETE SET NULL,
  odometro integer NOT NULL,
  litros numeric NOT NULL CHECK (litros > 0),
  tipo_combustivel text NOT NULL DEFAULT 'diesel', -- gasolina, etanol, diesel, gnv, etc
  valor_por_litro numeric NOT NULL CHECK (valor_por_litro >= 0),
  valor_total numeric NOT NULL CHECK (valor_total >= 0),
  posto text,
  tanque_cheio boolean NOT NULL DEFAULT true,
  observacoes text,
  obra_id uuid REFERENCES public.obras(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_frota_abast_veiculo ON public.frota_abastecimentos(veiculo_id);
CREATE INDEX IF NOT EXISTS idx_frota_abast_motorista ON public.frota_abastecimentos(motorista_id);
CREATE INDEX IF NOT EXISTS idx_frota_abast_data ON public.frota_abastecimentos(data);
CREATE INDEX IF NOT EXISTS idx_frota_abast_veiculo_data ON public.frota_abastecimentos(veiculo_id, data);

-- 4) MANUTENÇÕES
CREATE TABLE IF NOT EXISTS public.frota_manutencoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data date NOT NULL DEFAULT current_date,
  veiculo_id uuid NOT NULL REFERENCES public.frota_veiculos(id) ON DELETE CASCADE,
  tipo text NOT NULL DEFAULT 'preventiva', -- preventiva, corretiva
  servico text NOT NULL, -- troca de óleo, pneus, freios, etc
  oficina text,
  pecas_trocadas text,
  valor_mao_obra numeric NOT NULL DEFAULT 0,
  valor_pecas numeric NOT NULL DEFAULT 0,
  valor_total numeric GENERATED ALWAYS AS (coalesce(valor_mao_obra,0) + coalesce(valor_pecas,0)) STORED,
  odometro integer,
  proxima_revisao_km integer,
  proxima_revisao_data date,
  status text NOT NULL DEFAULT 'concluida', -- agendada, em_andamento, concluida, cancelada
  observacoes text,
  obra_id uuid REFERENCES public.obras(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_frota_manut_veiculo ON public.frota_manutencoes(veiculo_id);
CREATE INDEX IF NOT EXISTS idx_frota_manut_data ON public.frota_manutencoes(data);
CREATE INDEX IF NOT EXISTS idx_frota_manut_prox_km ON public.frota_manutencoes(proxima_revisao_km);
CREATE INDEX IF NOT EXISTS idx_frota_manut_prox_data ON public.frota_manutencoes(proxima_revisao_data);

-- 5) GASTOS AVULSOS
CREATE TABLE IF NOT EXISTS public.frota_gastos_avulsos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data date NOT NULL DEFAULT current_date,
  veiculo_id uuid REFERENCES public.frota_veiculos(id) ON DELETE SET NULL,
  motorista_id uuid REFERENCES public.frota_motoristas(id) ON DELETE SET NULL,
  categoria text NOT NULL, -- lavagem, estacionamento, multas, guincho, taxas, IPVA, seguro, etc
  descricao text NOT NULL,
  valor numeric NOT NULL CHECK (valor >= 0),
  forma_pagamento text,
  comprovante_url text,
  observacoes text,
  obra_id uuid REFERENCES public.obras(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_frota_gastos_veiculo ON public.frota_gastos_avulsos(veiculo_id);
CREATE INDEX IF NOT EXISTS idx_frota_gastos_categoria ON public.frota_gastos_avulsos(categoria);
CREATE INDEX IF NOT EXISTS idx_frota_gastos_data ON public.frota_gastos_avulsos(data);

-- 6) PEDÁGIOS
CREATE TABLE IF NOT EXISTS public.frota_pedagios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_hora timestamptz NOT NULL DEFAULT now(),
  data date GENERATED ALWAYS AS ((data_hora AT TIME ZONE 'America/Sao_Paulo')::date) STORED,
  veiculo_id uuid NOT NULL REFERENCES public.frota_veiculos(id) ON DELETE CASCADE,
  motorista_id uuid REFERENCES public.frota_motoristas(id) ON DELETE SET NULL,
  rota text, -- rodovia / rota
  praca text NOT NULL, -- praça de pedágio
  valor numeric NOT NULL CHECK (valor >= 0),
  forma_pagamento text NOT NULL DEFAULT 'tag', -- tag, dinheiro, cartao, pix
  tag_operadora text, -- Sem Parar, ConectCar, Veloe
  comprovante_url text,
  observacoes text,
  obra_id uuid REFERENCES public.obras(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_frota_pedag_veiculo ON public.frota_pedagios(veiculo_id);
CREATE INDEX IF NOT EXISTS idx_frota_pedag_data ON public.frota_pedagios(data_hora);
CREATE INDEX IF NOT EXISTS idx_frota_pedag_praca ON public.frota_pedagios(praca);

-- RLS
DO $$ DECLARE t text; BEGIN
  FOR t IN SELECT unnest(ARRAY['frota_veiculos','frota_motoristas','frota_abastecimentos','frota_manutencoes','frota_gastos_avulsos','frota_pedagios'])
  LOOP EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t); END LOOP;
END $$;

DO $$ DECLARE t text; BEGIN
  FOR t IN SELECT unnest(ARRAY['frota_veiculos','frota_motoristas','frota_abastecimentos','frota_manutencoes','frota_gastos_avulsos','frota_pedagios'])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "allow_all_authenticated" ON public.%I', t);
    EXECUTE format('CREATE POLICY "allow_all_authenticated" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;

-- updated_at trigger
DO $$ DECLARE t text; BEGIN
  FOR t IN SELECT unnest(ARRAY['frota_veiculos','frota_motoristas','frota_abastecimentos','frota_manutencoes','frota_gastos_avulsos','frota_pedagios'])
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_touch_%I ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_touch_%I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at()', t, t);
  END LOOP;
END $$;

-- Função helper: calcula km/L e R$/km por veículo (para ranking/dashboard)
CREATE OR REPLACE FUNCTION public.frota_kpi_por_veiculo(_veiculo_id uuid)
RETURNS TABLE(total_km numeric, total_litros numeric, media_kml numeric, custo_por_km numeric, total_gasto_combustivel numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH ab AS (
    SELECT odometro, litros, valor_total,
           lag(odometro) OVER (ORDER BY data, odometro, created_at) AS prev_od
    FROM public.frota_abastecimentos WHERE veiculo_id = _veiculo_id
  )
  SELECT
    COALESCE(SUM(GREATEST(ab.odometro - ab.prev_od, 0)),0) AS total_km,
    COALESCE(SUM(ab.litros),0) AS total_litros,
    CASE WHEN SUM(ab.litros) > 0 THEN SUM(GREATEST(ab.odometro - ab.prev_od, 0)) / SUM(ab.litros) ELSE NULL END AS media_kml,
    CASE WHEN SUM(GREATEST(ab.odometro - ab.prev_od, 0)) > 0 THEN SUM(ab.valor_total) / SUM(GREATEST(ab.odometro - ab.prev_od, 0)) ELSE NULL END AS custo_por_km,
    COALESCE(SUM(ab.valor_total),0) AS total_gasto
  FROM ab WHERE ab.prev_od IS NOT NULL;
$$;
