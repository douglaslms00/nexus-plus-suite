
-- =========================
-- OBRAS
-- =========================
CREATE TABLE public.obras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  endereco TEXT,
  status TEXT NOT NULL DEFAULT 'ativa',
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.obras TO authenticated;
GRANT ALL ON public.obras TO service_role;
ALTER TABLE public.obras ENABLE ROW LEVEL SECURITY;
CREATE POLICY obras_sel ON public.obras FOR SELECT TO authenticated USING (true);
CREATE POLICY obras_ins ON public.obras FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_gestor(auth.uid()));
CREATE POLICY obras_upd ON public.obras FOR UPDATE TO authenticated USING (public.is_admin_or_gestor(auth.uid()));
CREATE POLICY obras_del ON public.obras FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER obras_touch BEFORE UPDATE ON public.obras FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========================
-- ATIVOS
-- =========================
CREATE TABLE public.ativos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT,
  nome TEXT NOT NULL,
  descricao TEXT,
  categoria TEXT,
  estado TEXT NOT NULL DEFAULT 'em_uso',
  valor NUMERIC(12,2),
  data_aquisicao DATE,
  obra_id UUID REFERENCES public.obras(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ativos TO authenticated;
GRANT ALL ON public.ativos TO service_role;
ALTER TABLE public.ativos ENABLE ROW LEVEL SECURITY;
CREATE POLICY ativos_sel ON public.ativos FOR SELECT TO authenticated USING (true);
CREATE POLICY ativos_ins ON public.ativos FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_gestor(auth.uid()));
CREATE POLICY ativos_upd ON public.ativos FOR UPDATE TO authenticated USING (public.is_admin_or_gestor(auth.uid()));
CREATE POLICY ativos_del ON public.ativos FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER ativos_touch BEFORE UPDATE ON public.ativos FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Manutenções de ativos
CREATE TABLE public.ativo_manutencoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ativo_id UUID NOT NULL REFERENCES public.ativos(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL DEFAULT 'preventiva', -- preventiva | corretiva
  descricao TEXT,
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  proxima_em DATE,
  custo NUMERIC(12,2),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ativo_manutencoes TO authenticated;
GRANT ALL ON public.ativo_manutencoes TO service_role;
ALTER TABLE public.ativo_manutencoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY am_sel ON public.ativo_manutencoes FOR SELECT TO authenticated USING (true);
CREATE POLICY am_ins ON public.ativo_manutencoes FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_gestor(auth.uid()));
CREATE POLICY am_upd ON public.ativo_manutencoes FOR UPDATE TO authenticated USING (public.is_admin_or_gestor(auth.uid()));
CREATE POLICY am_del ON public.ativo_manutencoes FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Transferências de ativos entre obras (com aprovação)
CREATE TABLE public.ativo_transferencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ativo_id UUID NOT NULL REFERENCES public.ativos(id) ON DELETE CASCADE,
  obra_origem_id UUID REFERENCES public.obras(id) ON DELETE SET NULL,
  obra_destino_id UUID NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  motivo TEXT,
  status TEXT NOT NULL DEFAULT 'pendente', -- pendente | aprovada | rejeitada
  solicitado_por UUID,
  aprovado_por UUID,
  decidido_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ativo_transferencias TO authenticated;
GRANT ALL ON public.ativo_transferencias TO service_role;
ALTER TABLE public.ativo_transferencias ENABLE ROW LEVEL SECURITY;
CREATE POLICY at_sel ON public.ativo_transferencias FOR SELECT TO authenticated USING (true);
CREATE POLICY at_ins ON public.ativo_transferencias FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY at_upd ON public.ativo_transferencias FOR UPDATE TO authenticated USING (public.is_admin_or_gestor(auth.uid()));
CREATE POLICY at_del ON public.ativo_transferencias FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- =========================
-- FERRAMENTAS
-- =========================
CREATE TABLE public.ferramentas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  codigo TEXT,
  descricao TEXT,
  estado TEXT NOT NULL DEFAULT 'disponivel', -- disponivel | emprestada | manutencao | descartada
  proxima_manutencao DATE,
  obra_id UUID REFERENCES public.obras(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ferramentas TO authenticated;
GRANT ALL ON public.ferramentas TO service_role;
ALTER TABLE public.ferramentas ENABLE ROW LEVEL SECURITY;
CREATE POLICY fer_sel ON public.ferramentas FOR SELECT TO authenticated USING (true);
CREATE POLICY fer_ins ON public.ferramentas FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_gestor(auth.uid()));
CREATE POLICY fer_upd ON public.ferramentas FOR UPDATE TO authenticated USING (public.is_admin_or_gestor(auth.uid()));
CREATE POLICY fer_del ON public.ferramentas FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER ferramentas_touch BEFORE UPDATE ON public.ferramentas FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.ferramenta_emprestimos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ferramenta_id UUID NOT NULL REFERENCES public.ferramentas(id) ON DELETE CASCADE,
  funcionario_id UUID REFERENCES public.funcionarios(id) ON DELETE SET NULL,
  data_emprestimo DATE NOT NULL DEFAULT CURRENT_DATE,
  prevista_devolucao DATE,
  data_devolucao DATE,
  anexo_url TEXT,
  observacoes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ferramenta_emprestimos TO authenticated;
GRANT ALL ON public.ferramenta_emprestimos TO service_role;
ALTER TABLE public.ferramenta_emprestimos ENABLE ROW LEVEL SECURITY;
CREATE POLICY fe_sel ON public.ferramenta_emprestimos FOR SELECT TO authenticated USING (true);
CREATE POLICY fe_ins ON public.ferramenta_emprestimos FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_gestor(auth.uid()));
CREATE POLICY fe_upd ON public.ferramenta_emprestimos FOR UPDATE TO authenticated USING (public.is_admin_or_gestor(auth.uid()));
CREATE POLICY fe_del ON public.ferramenta_emprestimos FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- =========================
-- MATERIAIS
-- =========================
CREATE TABLE public.materiais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  codigo TEXT,
  unidade TEXT NOT NULL DEFAULT 'un',
  descricao TEXT,
  estoque_atual NUMERIC(12,3) NOT NULL DEFAULT 0,
  estoque_minimo NUMERIC(12,3) NOT NULL DEFAULT 0,
  preco_medio NUMERIC(12,2),
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.materiais TO authenticated;
GRANT ALL ON public.materiais TO service_role;
ALTER TABLE public.materiais ENABLE ROW LEVEL SECURITY;
CREATE POLICY mat_sel ON public.materiais FOR SELECT TO authenticated USING (true);
CREATE POLICY mat_ins ON public.materiais FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_gestor(auth.uid()));
CREATE POLICY mat_upd ON public.materiais FOR UPDATE TO authenticated USING (public.is_admin_or_gestor(auth.uid()));
CREATE POLICY mat_del ON public.materiais FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER materiais_touch BEFORE UPDATE ON public.materiais FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.material_movimentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id UUID NOT NULL REFERENCES public.materiais(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL, -- entrada | saida
  quantidade NUMERIC(12,3) NOT NULL,
  obra_id UUID REFERENCES public.obras(id) ON DELETE SET NULL,
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  observacoes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.material_movimentos TO authenticated;
GRANT ALL ON public.material_movimentos TO service_role;
ALTER TABLE public.material_movimentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY mm_sel ON public.material_movimentos FOR SELECT TO authenticated USING (true);
CREATE POLICY mm_ins ON public.material_movimentos FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_gestor(auth.uid()));
CREATE POLICY mm_upd ON public.material_movimentos FOR UPDATE TO authenticated USING (public.is_admin_or_gestor(auth.uid()));
CREATE POLICY mm_del ON public.material_movimentos FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Trigger: atualiza estoque ao inserir movimento
CREATE OR REPLACE FUNCTION public.apply_material_movimento()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.tipo = 'entrada' THEN
    UPDATE public.materiais SET estoque_atual = estoque_atual + NEW.quantidade WHERE id = NEW.material_id;
  ELSIF NEW.tipo = 'saida' THEN
    UPDATE public.materiais SET estoque_atual = estoque_atual - NEW.quantidade WHERE id = NEW.material_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER material_movimento_apply AFTER INSERT ON public.material_movimentos
FOR EACH ROW EXECUTE FUNCTION public.apply_material_movimento();

-- =========================
-- FINANCEIRO (carteira virtual + contas)
-- =========================
CREATE TABLE public.contas_financeiras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  descricao TEXT NOT NULL,
  tipo TEXT NOT NULL, -- pagar | receber
  valor NUMERIC(12,2) NOT NULL,
  data_vencimento DATE NOT NULL,
  data_pagamento DATE,
  status TEXT NOT NULL DEFAULT 'pendente', -- pendente | pago | atrasado | cancelado
  categoria TEXT,
  user_id UUID, -- vínculo opcional à carteira de um usuário
  obra_id UUID REFERENCES public.obras(id) ON DELETE SET NULL,
  observacoes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contas_financeiras TO authenticated;
GRANT ALL ON public.contas_financeiras TO service_role;
ALTER TABLE public.contas_financeiras ENABLE ROW LEVEL SECURITY;

-- Admin/gestor/financeiro veem tudo; demais só veem as próprias contas
CREATE POLICY cf_sel ON public.contas_financeiras FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'gestor')
    OR public.has_role(auth.uid(), 'financeiro')
    OR user_id = auth.uid()
  );
CREATE POLICY cf_ins ON public.contas_financeiras FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'gestor')
    OR public.has_role(auth.uid(), 'financeiro')
  );
CREATE POLICY cf_upd ON public.contas_financeiras FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'gestor')
    OR public.has_role(auth.uid(), 'financeiro')
  );
CREATE POLICY cf_del ON public.contas_financeiras FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER cf_touch BEFORE UPDATE ON public.contas_financeiras FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========================
-- RBAC: promoção e gestão de papéis
-- =========================

-- Qualquer autenticado pode se promover a admin SE ainda não existir admin no sistema
CREATE OR REPLACE FUNCTION public.promote_to_admin_if_no_admin()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_count INT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;
  SELECT COUNT(*) INTO v_count FROM public.user_roles WHERE role = 'admin';
  IF v_count > 0 THEN
    RETURN 'Já existe um admin no sistema. Solicite a um administrador que conceda o papel.';
  END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (v_uid, 'admin')
    ON CONFLICT DO NOTHING;
  RETURN 'Você foi promovido a admin.';
END $$;
GRANT EXECUTE ON FUNCTION public.promote_to_admin_if_no_admin() TO authenticated;

-- Admin pode adicionar/remover papéis de qualquer usuário
CREATE OR REPLACE FUNCTION public.admin_set_role(_user_id UUID, _role app_role, _grant BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Apenas admin pode alterar papéis';
  END IF;
  IF _grant THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (_user_id, _role) ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.user_roles WHERE user_id = _user_id AND role = _role;
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.admin_set_role(UUID, app_role, BOOLEAN) TO authenticated;
