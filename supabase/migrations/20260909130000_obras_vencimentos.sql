-- Vencimentos para Obras: Alvará, PGR, PCMSO, LTCAT e Outros (igual padrão de funcionarios)
ALTER TABLE public.obras
  ADD COLUMN IF NOT EXISTS data_alvara date,
  ADD COLUMN IF NOT EXISTS vencimento_alvara date,
  ADD COLUMN IF NOT EXISTS validade_meses_alvara integer,
  ADD COLUMN IF NOT EXISTS data_pgr date,
  ADD COLUMN IF NOT EXISTS vencimento_pgr date,
  ADD COLUMN IF NOT EXISTS validade_meses_pgr integer,
  ADD COLUMN IF NOT EXISTS data_pcmso date,
  ADD COLUMN IF NOT EXISTS vencimento_pcmso date,
  ADD COLUMN IF NOT EXISTS validade_meses_pcmso integer,
  ADD COLUMN IF NOT EXISTS data_ltcat date,
  ADD COLUMN IF NOT EXISTS vencimento_ltcat date,
  ADD COLUMN IF NOT EXISTS validade_meses_ltcat integer,
  ADD COLUMN IF NOT EXISTS data_outros date,
  ADD COLUMN IF NOT EXISTS vencimento_outros date,
  ADD COLUMN IF NOT EXISTS validade_meses_outros integer,
  ADD COLUMN IF NOT EXISTS descricao_outros text;

-- Tabela dinâmica para vencimentos "Outros" adicionais por obra (similar a funcionario_treinamentos)
CREATE TABLE IF NOT EXISTS public.obra_vencimentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id uuid NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  nome text NOT NULL,
  data_emissao date,
  data_vencimento date,
  observacoes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.obra_vencimentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS obra_venc_select ON public.obra_vencimentos;
CREATE POLICY obra_venc_select ON public.obra_vencimentos FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS obra_venc_insert ON public.obra_vencimentos;
CREATE POLICY obra_venc_insert ON public.obra_vencimentos FOR INSERT TO authenticated WITH CHECK (public.can_module(auth.uid(), 'obras', 'edit'));

DROP POLICY IF EXISTS obra_venc_update ON public.obra_vencimentos;
CREATE POLICY obra_venc_update ON public.obra_vencimentos FOR UPDATE TO authenticated USING (public.can_module(auth.uid(), 'obras', 'edit')) WITH CHECK (public.can_module(auth.uid(), 'obras', 'edit'));

DROP POLICY IF EXISTS obra_venc_delete ON public.obra_vencimentos;
CREATE POLICY obra_venc_delete ON public.obra_vencimentos FOR DELETE TO authenticated USING (public.can_module(auth.uid(), 'obras', 'delete'));

CREATE INDEX IF NOT EXISTS idx_obra_vencimentos_obra ON public.obra_vencimentos(obra_id);
CREATE INDEX IF NOT EXISTS idx_obra_vencimentos_venc ON public.obra_vencimentos(data_vencimento);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS trg_obra_venc_touch ON public.obra_vencimentos;
CREATE TRIGGER trg_obra_venc_touch BEFORE UPDATE ON public.obra_vencimentos FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Estender gerar_notificacoes_vencimentos para incluir vencimentos de obras
CREATE OR REPLACE FUNCTION public.gerar_notificacoes_vencimentos()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count int := 0;
  r record;
  m record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  -- Funcionarios (mantido)
  FOR r IN
    SELECT f.id, f.nome, x.rotulo, x.venc
    FROM public.funcionarios f
    CROSS JOIN LATERAL (VALUES
      ('ASO', f.vencimento_aso), ('Treinamento', f.vencimento_treinamento),
      ('Folga de campo', f.vencimento_folga_campo), ('Férias', f.vencimento_ferias),
      ('Ficha de EPI', f.vencimento_ficha_epi), ('Experiência', f.vencimento_experiencia)
    ) AS x(rotulo, venc)
    WHERE f.ativo AND x.venc IS NOT NULL AND x.venc <= current_date + 30
      AND NOT (x.rotulo = 'Experiência' AND (COALESCE(f.experiencia_concluida, false) OR x.venc < current_date))
  LOOP
    FOR m IN SELECT DISTINCT user_id FROM public.user_roles WHERE role IN ('admin','gestor') LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.user_id = m.user_id AND n.ref_id = r.id
          AND n.tipo = 'vencimento_funcionario' AND n.titulo LIKE r.rotulo || '%'
          AND n.created_at > now() - interval '7 days'
      ) THEN
        PERFORM public.notify_user(m.user_id, 'vencimento_funcionario',
          r.rotulo || (CASE WHEN r.venc < current_date THEN ' vencido' ELSE ' a vencer' END),
          r.nome || ' — ' || to_char(r.venc, 'DD/MM/YYYY'), '/funcionarios', 'funcionarios', r.id);
        v_count := v_count + 1;
      END IF;
    END LOOP;
  END LOOP;

  -- Obras: Alvará, PGR, PCMSO, LTCAT, Outros + vencimentos dinâmicos
  FOR r IN
    SELECT o.id, o.nome, x.rotulo, x.venc
    FROM public.obras o
    CROSS JOIN LATERAL (VALUES
      ('Alvará', o.vencimento_alvara),
      ('PGR', o.vencimento_pgr),
      ('PCMSO', o.vencimento_pcmso),
      ('LTCAT', o.vencimento_ltcat),
      ('Outros', o.vencimento_outros)
    ) AS x(rotulo, venc)
    WHERE o.status = 'ativa' AND x.venc IS NOT NULL AND x.venc <= current_date + 30
  LOOP
    FOR m IN SELECT DISTINCT user_id FROM public.user_roles WHERE role IN ('admin','gestor') LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.user_id = m.user_id AND n.ref_id = r.id
          AND n.tipo = 'vencimento_obra' AND n.titulo = r.rotulo || ' - ' || r.nome
          AND n.created_at > now() - interval '7 days'
      ) THEN
        PERFORM public.notify_user(m.user_id, 'vencimento_obra',
          r.rotulo || (CASE WHEN r.venc < current_date THEN ' vencido' ELSE ' a vencer' END) || ' - ' || r.nome,
          r.rotulo || ' — ' || to_char(r.venc, 'DD/MM/YYYY'), '/obras', 'obras', r.id);
        v_count := v_count + 1;
      END IF;
    END LOOP;
  END LOOP;

  -- Vencimentos dinâmicos de obras
  FOR r IN
    SELECT ov.obra_id as id, o.nome as obra_nome, ov.nome as rotulo, ov.data_vencimento as venc
    FROM public.obra_vencimentos ov
    JOIN public.obras o ON o.id = ov.obra_id
    WHERE ov.data_vencimento IS NOT NULL AND ov.data_vencimento <= current_date + 30 AND o.status = 'ativa'
  LOOP
    FOR m IN SELECT DISTINCT user_id FROM public.user_roles WHERE role IN ('admin','gestor') LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.user_id = m.user_id AND n.ref_id = r.id
          AND n.tipo = 'vencimento_obra' AND n.titulo LIKE r.rotulo || '%'
          AND n.created_at > now() - interval '7 days'
      ) THEN
        PERFORM public.notify_user(m.user_id, 'vencimento_obra',
          r.rotulo || (CASE WHEN r.venc < current_date THEN ' vencido' ELSE ' a vencer' END) || ' - ' || r.obra_nome,
          r.rotulo || ' — ' || to_char(r.venc, 'DD/MM/YYYY'), '/obras', 'obras', r.id);
        v_count := v_count + 1;
      END IF;
    END LOOP;
  END LOOP;

  FOR r IN
    SELECT c.id, c.descricao, c.data_vencimento
    FROM public.contas_financeiras c
    WHERE c.status <> 'pago' AND c.data_vencimento <= current_date + 7
  LOOP
    FOR m IN SELECT DISTINCT user_id FROM public.user_roles WHERE role IN ('admin','gestor','financeiro') LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.user_id = m.user_id AND n.ref_id = r.id AND n.tipo = 'vencimento_conta'
          AND n.created_at > now() - interval '3 days'
      ) THEN
        PERFORM public.notify_user(m.user_id, 'vencimento_conta',
          CASE WHEN r.data_vencimento < current_date THEN 'Conta em atraso' ELSE 'Conta a vencer' END,
          r.descricao || ' — ' || to_char(r.data_vencimento,'DD/MM/YYYY'), '/financeiro', 'contas_financeiras', r.id);
        v_count := v_count + 1;
      END IF;
    END LOOP;
  END LOOP;

  FOR r IN
    SELECT f.id, f.nome, f.proxima_manutencao
    FROM public.ferramentas f
    WHERE f.proxima_manutencao IS NOT NULL AND f.proxima_manutencao <= current_date + 15
  LOOP
    FOR m IN SELECT DISTINCT user_id FROM public.user_roles WHERE role IN ('admin','gestor') LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.user_id = m.user_id AND n.ref_id = r.id AND n.tipo = 'manutencao_ferramenta'
          AND n.created_at > now() - interval '7 days'
      ) THEN
        PERFORM public.notify_user(m.user_id, 'manutencao_ferramenta', 'Manutenção de ferramenta',
          r.nome || ' — ' || to_char(r.proxima_manutencao,'DD/MM/YYYY'), '/ferramentas', 'ferramentas', r.id);
        v_count := v_count + 1;
      END IF;
    END LOOP;
  END LOOP;

  RETURN v_count;
END $$;
REVOKE ALL ON FUNCTION public.gerar_notificacoes_vencimentos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gerar_notificacoes_vencimentos() TO authenticated;
