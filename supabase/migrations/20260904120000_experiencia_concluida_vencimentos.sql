-- Experiência: quando vencimento passa, considera concluído e não emite mais alertas
-- Atualiza rotina de vencimentos para ignorar experiência já concluída (flag ou data passada)
CREATE OR REPLACE FUNCTION public.gerar_notificacoes_vencimentos()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count int := 0;
  r record;
  m record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  FOR r IN
    SELECT f.id, f.nome, x.rotulo, x.venc
    FROM public.funcionarios f
    CROSS JOIN LATERAL (VALUES
      ('ASO', f.vencimento_aso), ('Treinamento', f.vencimento_treinamento),
      ('Folga de campo', f.vencimento_folga_campo), ('Férias', f.vencimento_ferias),
      ('Ficha de EPI', f.vencimento_ficha_epi), ('Experiência', f.vencimento_experiencia)
    ) AS x(rotulo, venc)
    WHERE f.ativo AND x.venc IS NOT NULL AND x.venc <= current_date + 30
      -- Experiência concluída (manual ou data já passada) não gera notificação
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
