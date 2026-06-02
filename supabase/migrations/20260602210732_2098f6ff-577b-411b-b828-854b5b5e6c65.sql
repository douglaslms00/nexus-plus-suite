
-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('admin', 'gestor', 'colaborador', 'financeiro');
CREATE TYPE public.task_priority AS ENUM ('baixa', 'media', 'alta');
CREATE TYPE public.task_status AS ENUM ('pendente', 'em_andamento', 'concluida');
CREATE TYPE public.epi_movimento_tipo AS ENUM ('entrada', 'saida', 'devolucao');

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  setor TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============ USER ROLES ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_gestor(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin','gestor')
  )
$$;

-- ============ FUNCIONARIOS ============
CREATE TABLE public.funcionarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  cpf TEXT,
  funcao TEXT,
  setor TEXT,
  data_admissao DATE,
  experiencia_concluida BOOLEAN NOT NULL DEFAULT false,
  ativo BOOLEAN NOT NULL DEFAULT true,
  email TEXT,
  telefone TEXT,
  -- Datas de vencimento
  vencimento_aso DATE,
  vencimento_treinamento DATE,
  vencimento_folga_campo DATE,
  vencimento_ferias DATE,
  vencimento_ficha_epi DATE,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.funcionarios TO authenticated;
GRANT ALL ON public.funcionarios TO service_role;
ALTER TABLE public.funcionarios ENABLE ROW LEVEL SECURITY;

-- ============ TAREFAS ============
CREATE TABLE public.tarefas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo TEXT NOT NULL,
  descricao TEXT,
  prioridade public.task_priority NOT NULL DEFAULT 'media',
  status public.task_status NOT NULL DEFAULT 'pendente',
  concluida BOOLEAN NOT NULL DEFAULT false,
  responsavel_id UUID REFERENCES auth.users(id),
  data_vencimento DATE,
  concluida_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tarefas TO authenticated;
GRANT ALL ON public.tarefas TO service_role;
ALTER TABLE public.tarefas ENABLE ROW LEVEL SECURITY;

-- ============ EPIS ============
CREATE TABLE public.epis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'EPI', -- 'EPI' ou 'EPC'
  ca TEXT, -- Certificado de Aprovação
  descricao TEXT,
  estoque_atual INTEGER NOT NULL DEFAULT 0,
  estoque_minimo INTEGER NOT NULL DEFAULT 0,
  validade_meses INTEGER, -- duração padrão do equipamento
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.epis TO authenticated;
GRANT ALL ON public.epis TO service_role;
ALTER TABLE public.epis ENABLE ROW LEVEL SECURITY;

-- ============ EPI MOVIMENTOS ============
CREATE TABLE public.epi_movimentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  epi_id UUID NOT NULL REFERENCES public.epis(id) ON DELETE CASCADE,
  funcionario_id UUID REFERENCES public.funcionarios(id) ON DELETE SET NULL,
  tipo public.epi_movimento_tipo NOT NULL,
  quantidade INTEGER NOT NULL DEFAULT 1,
  data_movimento DATE NOT NULL DEFAULT CURRENT_DATE,
  data_vencimento DATE,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.epi_movimentos TO authenticated;
GRANT ALL ON public.epi_movimentos TO service_role;
ALTER TABLE public.epi_movimentos ENABLE ROW LEVEL SECURITY;

-- ============ RLS POLICIES ============

-- profiles: cada usuário vê e edita o próprio; admin vê todos
CREATE POLICY "profiles_select_self_or_admin" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'gestor'));
CREATE POLICY "profiles_insert_self" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_update_self_or_admin" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- user_roles: usuário vê os próprios papéis; admin vê todos (não permitimos client-side mudar papéis)
CREATE POLICY "user_roles_select_self_or_admin" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- funcionarios
CREATE POLICY "funcionarios_select_authenticated" ON public.funcionarios FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "funcionarios_insert_gestor" ON public.funcionarios FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_gestor(auth.uid()));
CREATE POLICY "funcionarios_update_gestor" ON public.funcionarios FOR UPDATE TO authenticated
  USING (public.is_admin_or_gestor(auth.uid()));
CREATE POLICY "funcionarios_delete_admin" ON public.funcionarios FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- tarefas: todos veem; gestores criam para qualquer um; colaborador atualiza próprias
CREATE POLICY "tarefas_select_authenticated" ON public.tarefas FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "tarefas_insert_gestor" ON public.tarefas FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_gestor(auth.uid()));
CREATE POLICY "tarefas_update_owner_or_gestor" ON public.tarefas FOR UPDATE TO authenticated
  USING (responsavel_id = auth.uid() OR public.is_admin_or_gestor(auth.uid()));
CREATE POLICY "tarefas_delete_admin" ON public.tarefas FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- epis
CREATE POLICY "epis_select_authenticated" ON public.epis FOR SELECT TO authenticated USING (true);
CREATE POLICY "epis_insert_gestor" ON public.epis FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_gestor(auth.uid()));
CREATE POLICY "epis_update_gestor" ON public.epis FOR UPDATE TO authenticated
  USING (public.is_admin_or_gestor(auth.uid()));
CREATE POLICY "epis_delete_admin" ON public.epis FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- epi_movimentos
CREATE POLICY "epi_mov_select_authenticated" ON public.epi_movimentos FOR SELECT TO authenticated USING (true);
CREATE POLICY "epi_mov_insert_gestor" ON public.epi_movimentos FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_gestor(auth.uid()));
CREATE POLICY "epi_mov_update_gestor" ON public.epi_movimentos FOR UPDATE TO authenticated
  USING (public.is_admin_or_gestor(auth.uid()));
CREATE POLICY "epi_mov_delete_admin" ON public.epi_movimentos FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ============ TRIGGER: auto-create profile + papel padrão (colaborador) no signup ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, nome, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome', NEW.email), NEW.email);

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'colaborador');

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ TRIGGER: updated_at ============
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_funcionarios_updated BEFORE UPDATE ON public.funcionarios
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_tarefas_updated BEFORE UPDATE ON public.tarefas
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_epis_updated BEFORE UPDATE ON public.epis
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
