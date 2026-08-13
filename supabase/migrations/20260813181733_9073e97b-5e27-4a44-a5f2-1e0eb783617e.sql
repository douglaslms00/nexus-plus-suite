
-- 1) Campos do fluxo de aprovação
ALTER TABLE public.adiantamentos
  ADD COLUMN IF NOT EXISTS enviado_em timestamptz,
  ADD COLUMN IF NOT EXISTS aprovado_por uuid,
  ADD COLUMN IF NOT EXISTS aprovado_em timestamptz,
  ADD COLUMN IF NOT EXISTS motivo_rejeicao text;

-- 2) Helper: notificar gestores/admins
CREATE OR REPLACE FUNCTION public.notify_managers(_tipo text, _titulo text, _mensagem text, _link text, _ref_table text, _ref_id uuid, _exclude uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT user_id FROM public.user_roles WHERE role IN ('admin','gestor') LOOP
    IF _exclude IS NULL OR r.user_id <> _exclude THEN
      PERFORM public.notify_user(r.user_id, _tipo, _titulo, _mensagem, _link, _ref_table, _ref_id);
    END IF;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.notify_managers(text,text,text,text,text,uuid,uuid) FROM PUBLIC, anon, authenticated;

-- 3) Regras de transição de status
CREATE OR REPLACE FUNCTION public.adiantamentos_guard_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_mgr boolean := public.is_admin_or_gestor(auth.uid());
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status IN ('aprovado','rejeitado') AND NOT v_mgr THEN
      RAISE EXCEPTION 'Apenas gestores podem aprovar ou rejeitar prestações';
    END IF;
    IF NEW.status = 'enviado' THEN
      NEW.enviado_em := now();
    END IF;
    IF NEW.status IN ('aprovado','rejeitado') THEN
      NEW.aprovado_por := auth.uid();
      NEW.aprovado_em := now();
    END IF;
    IF OLD.status IN ('aprovado') AND NOT v_mgr THEN
      RAISE EXCEPTION 'Prestação aprovada não pode ser alterada';
    END IF;
  ELSIF OLD.status IN ('enviado','aprovado') AND NOT v_mgr THEN
    RAISE EXCEPTION 'Prestação enviada não pode ser alterada';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.adiantamentos_guard_status() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_adiantamentos_guard ON public.adiantamentos;
CREATE TRIGGER trg_adiantamentos_guard BEFORE UPDATE ON public.adiantamentos
FOR EACH ROW EXECUTE FUNCTION public.adiantamentos_guard_status();

-- 4) Notificações do fluxo
CREATE OR REPLACE FUNCTION public.adiantamentos_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_nome text;
BEGIN
  SELECT nome INTO v_nome FROM public.profiles WHERE id = auth.uid();
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'enviado' THEN
      PERFORM public.notify_managers('prestacao_enviada', 'Prestação enviada para aprovação',
        COALESCE(v_nome,'Usuário') || ' enviou: ' || NEW.titulo, '/prestacao', 'adiantamentos', NEW.id, auth.uid());
    ELSIF NEW.status = 'aprovado' THEN
      PERFORM public.notify_user(COALESCE(NEW.responsavel_id, NEW.created_by), 'prestacao_aprovada',
        'Prestação aprovada', NEW.titulo || ' foi aprovada por ' || COALESCE(v_nome,'gestor'), '/prestacao', 'adiantamentos', NEW.id);
    ELSIF NEW.status = 'rejeitado' THEN
      PERFORM public.notify_user(COALESCE(NEW.responsavel_id, NEW.created_by), 'prestacao_rejeitada',
        'Prestação rejeitada', COALESCE(NEW.motivo_rejeicao, 'Sem motivo informado'), '/prestacao', 'adiantamentos', NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.adiantamentos_notify() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_adiantamentos_notify ON public.adiantamentos;
CREATE TRIGGER trg_adiantamentos_notify AFTER UPDATE ON public.adiantamentos
FOR EACH ROW EXECUTE FUNCTION public.adiantamentos_notify();

-- 5) Visibilidade: cada usuário vê a sua prestação
DROP POLICY IF EXISTS adiantamentos_sel ON public.adiantamentos;
CREATE POLICY adiantamentos_sel ON public.adiantamentos FOR SELECT TO authenticated
USING (responsavel_id = auth.uid() OR created_by = auth.uid() OR public.is_admin_or_gestor(auth.uid()));

DROP POLICY IF EXISTS despesas_sel ON public.adiantamento_despesas;
CREATE POLICY despesas_sel ON public.adiantamento_despesas FOR SELECT TO authenticated
USING (
  created_by = auth.uid()
  OR public.is_admin_or_gestor(auth.uid())
  OR EXISTS (SELECT 1 FROM public.adiantamentos a WHERE a.id = adiantamento_id
             AND (a.created_by = auth.uid() OR a.responsavel_id = auth.uid()))
);

-- despesas só entram enquanto a prestação estiver aberta
DROP POLICY IF EXISTS despesas_ins ON public.adiantamento_despesas;
CREATE POLICY despesas_ins ON public.adiantamento_despesas FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND public.can_module(auth.uid(), 'prestacao', 'edit')
  AND EXISTS (SELECT 1 FROM public.adiantamentos a WHERE a.id = adiantamento_id
              AND a.status IN ('aberto','rejeitado')
              AND (a.created_by = auth.uid() OR a.responsavel_id = auth.uid() OR public.is_admin_or_gestor(auth.uid())))
);

-- 6) Notificações gerais do sistema
CREATE OR REPLACE FUNCTION public.contas_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.notify_managers('financeiro_nova', 'Nova conta ' || NEW.tipo,
      NEW.descricao || ' — vence em ' || to_char(NEW.data_vencimento,'DD/MM/YYYY'), '/financeiro', 'contas_financeiras', NEW.id, auth.uid());
  ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'pago' THEN
    PERFORM public.notify_managers('financeiro_pago', 'Conta baixada', NEW.descricao, '/financeiro', 'contas_financeiras', NEW.id, auth.uid());
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.contas_notify() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_contas_notify ON public.contas_financeiras;
CREATE TRIGGER trg_contas_notify AFTER INSERT OR UPDATE ON public.contas_financeiras
FOR EACH ROW EXECUTE FUNCTION public.contas_notify();

CREATE OR REPLACE FUNCTION public.materiais_estoque_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.estoque_atual <= NEW.estoque_minimo AND (OLD.estoque_atual > OLD.estoque_minimo) THEN
    PERFORM public.notify_managers('estoque_baixo', 'Estoque baixo: ' || NEW.nome,
      'Saldo atual ' || NEW.estoque_atual || ' ' || NEW.unidade, '/materiais', 'materiais', NEW.id, NULL);
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.materiais_estoque_notify() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_materiais_estoque_notify ON public.materiais;
CREATE TRIGGER trg_materiais_estoque_notify AFTER UPDATE ON public.materiais
FOR EACH ROW EXECUTE FUNCTION public.materiais_estoque_notify();

CREATE OR REPLACE FUNCTION public.epis_estoque_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.estoque_atual <= NEW.estoque_minimo AND OLD.estoque_atual > OLD.estoque_minimo THEN
    PERFORM public.notify_managers('epi_estoque_baixo', 'Estoque baixo de EPI: ' || NEW.nome,
      'Saldo atual ' || NEW.estoque_atual, '/epis', 'epis', NEW.id, NULL);
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.epis_estoque_notify() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_epis_estoque_notify ON public.epis;
CREATE TRIGGER trg_epis_estoque_notify AFTER UPDATE ON public.epis
FOR EACH ROW EXECUTE FUNCTION public.epis_estoque_notify();

CREATE OR REPLACE FUNCTION public.transferencias_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.notify_managers('transferencia_solicitada', 'Transferência de ativo solicitada',
      'Aguardando aprovação', '/ativos', 'ativo_transferencias', NEW.id, auth.uid());
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.notify_user(NEW.solicitado_por, 'transferencia_' || NEW.status,
      'Transferência ' || NEW.status, 'Sua solicitação foi ' || NEW.status, '/ativos', 'ativo_transferencias', NEW.id);
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.transferencias_notify() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_transferencias_notify ON public.ativo_transferencias;
CREATE TRIGGER trg_transferencias_notify AFTER INSERT OR UPDATE ON public.ativo_transferencias
FOR EACH ROW EXECUTE FUNCTION public.transferencias_notify();

-- 7) Rotina de vencimentos (chamada pelo app)
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
