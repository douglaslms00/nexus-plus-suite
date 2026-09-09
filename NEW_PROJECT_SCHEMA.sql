-- SCHEMA COMPLETO PARA NOVO PROJETO yrkdbrkijpwilhptmqii
-- Gerado a partir de src/integrations/supabase/types.ts (2026-09-10)
-- Execute este arquivo no SQL Editor do NOVO projeto: https://supabase.com/dashboard/project/yrkdbrkijpwilhptmqii/sql
-- Se o projeto estiver vazio, este script cria tudo. Se ja tiver tabelas, use IF NOT EXISTS para evitar erro.
-- Autor: opencode

-- 1) ENUMS
DO $$ BEGIN CREATE TYPE app_role AS ENUM ('admin','gestor','colaborador','financeiro'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE epi_movimento_tipo AS ENUM ('entrada','saida','devolucao'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE task_priority AS ENUM ('baixa','media','alta'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE task_status AS ENUM ('pendente','em_andamento','concluida'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 3) TABELAS BASE (sem FK primeiro)
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY,
  nome text NOT NULL,
  email text,
  cpf text,
  setor text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS profiles_cpf_unique ON public.profiles ((regexp_replace(cpf,'[^0-9]','','g'))) WHERE cpf IS NOT NULL AND btrim(cpf) <> '';

CREATE TABLE IF NOT EXISTS public.obras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  endereco text,
  observacoes text,
  status text NOT NULL DEFAULT 'ativa',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  data_alvara date, vencimento_alvara date, validade_meses_alvara integer,
  data_pgr date, vencimento_pgr date, validade_meses_pgr integer,
  data_pcmso date, vencimento_pcmso date, validade_meses_pcmso integer,
  data_ltcat date, vencimento_ltcat date, validade_meses_ltcat integer,
  data_outros date, vencimento_outros date, validade_meses_outros integer,
  descricao_outros text
);

CREATE TABLE IF NOT EXISTS public.funcionarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  cpf text, email text, telefone text, funcao text, setor text,
  obra_id uuid REFERENCES public.obras(id) ON DELETE SET NULL,
  ativo boolean NOT NULL DEFAULT true,
  endereco text, cidade text, observacoes text,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  data_admissao date,
  data_aso date, vencimento_aso date, validade_meses_aso integer,
  data_ferias date, vencimento_ferias date, validade_meses_ferias integer,
  data_folga_campo date, vencimento_folga_campo date, validade_meses_folga_campo integer,
  data_experiencia date, vencimento_experiencia date, validade_meses_experiencia integer,
  vencimento_treinamento date, validade_meses_treinamento integer,
  vencimento_ficha_epi date, validade_meses_ficha_epi integer,
  experiencia_concluida boolean NOT NULL DEFAULT false,
  matricula text
);

CREATE TABLE IF NOT EXISTS public.epis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL, descricao text, ca text, tipo text NOT NULL DEFAULT 'epi',
  estoque_atual integer NOT NULL DEFAULT 0, estoque_minimo integer NOT NULL DEFAULT 0,
  validade_meses integer, ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.materiais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL, descricao text, codigo text, unidade text NOT NULL DEFAULT 'un',
  estoque_atual numeric NOT NULL DEFAULT 0, estoque_minimo numeric NOT NULL DEFAULT 0,
  preco_medio numeric, ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ferramentas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL, descricao text, codigo text, estado text NOT NULL DEFAULT 'disponivel',
  obra_id uuid REFERENCES public.obras(id) ON DELETE SET NULL,
  proxima_manutencao date,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ativos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL, descricao text, codigo text, categoria text,
  obra_id uuid REFERENCES public.obras(id) ON DELETE SET NULL,
  estado text NOT NULL DEFAULT 'disponivel', valor numeric, data_aquisicao date,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tarefas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL, descricao text,
  status task_status NOT NULL DEFAULT 'pendente',
  prioridade task_priority NOT NULL DEFAULT 'media',
  data_vencimento date,
  created_by uuid, responsavel_id uuid, assigned_to uuid,
  assignment_status text NOT NULL DEFAULT 'pendente',
  assignment_response_at timestamptz, assignment_response_note text,
  concluida boolean NOT NULL DEFAULT false, concluida_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.contas_financeiras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  descricao text NOT NULL, tipo text NOT NULL, categoria text, escopo text NOT NULL DEFAULT 'geral',
  valor numeric NOT NULL, data_vencimento date NOT NULL, data_pagamento date, status text NOT NULL DEFAULT 'pendente',
  obra_id uuid REFERENCES public.obras(id) ON DELETE SET NULL,
  comprovante_url text, observacoes text, user_id uuid, created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.adiantamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL, valor numeric NOT NULL DEFAULT 0, data date NOT NULL DEFAULT current_date,
  status text NOT NULL DEFAULT 'rascunho', observacoes text,
  obra_id uuid REFERENCES public.obras(id) ON DELETE SET NULL,
  responsavel_id uuid, responsavel_nome text,
  criado_por uuid, created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  enviado_em timestamptz, aprovado_por uuid, aprovado_em timestamptz, motivo_rejeicao text
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL, tipo text NOT NULL, titulo text NOT NULL, mensagem text,
  link text, ref_table text, ref_id uuid, lida boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Permissoes / roles
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL, role app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
CREATE TABLE IF NOT EXISTS public.user_obras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL, obra_id uuid NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, obra_id)
);
CREATE TABLE IF NOT EXISTS public.custom_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE, label text NOT NULL, description text,
  parent_role_id uuid REFERENCES public.custom_roles(id) ON DELETE SET NULL,
  template_role app_role,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.custom_role_module_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  custom_role_id uuid NOT NULL REFERENCES public.custom_roles(id) ON DELETE CASCADE,
  module text NOT NULL, can_view boolean NOT NULL DEFAULT false, can_edit boolean NOT NULL DEFAULT false, can_delete boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(custom_role_id, module)
);
CREATE TABLE IF NOT EXISTS public.user_custom_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL, custom_role_id uuid NOT NULL REFERENCES public.custom_roles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, custom_role_id)
);
CREATE TABLE IF NOT EXISTS public.user_module_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL, module text NOT NULL,
  can_view boolean NOT NULL DEFAULT false, can_edit boolean NOT NULL DEFAULT false, can_delete boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, module)
);
CREATE TABLE IF NOT EXISTS public.system_role_labels (
  role app_role PRIMARY KEY, label text NOT NULL, description text, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.system_role_module_permissions (
  role app_role NOT NULL, module text NOT NULL,
  can_view boolean NOT NULL DEFAULT false, can_edit boolean NOT NULL DEFAULT false, can_delete boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(role, module)
);
CREATE TABLE IF NOT EXISTS public.permission_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid, actor_email text, target_user_id uuid, custom_role_id uuid,
  action text NOT NULL, module text, details jsonb, created_at timestamptz NOT NULL DEFAULT now()
);

-- Tabelas dependentes
CREATE TABLE IF NOT EXISTS public.adiantamento_despesas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  adiantamento_id uuid NOT NULL REFERENCES public.adiantamentos(id) ON DELETE CASCADE,
  descricao text NOT NULL, valor numeric NOT NULL DEFAULT 0, data date NOT NULL DEFAULT current_date,
  categoria text, cupom_url text, observacoes text, created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.ativo_emprestimos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ativo_id uuid NOT NULL REFERENCES public.ativos(id) ON DELETE CASCADE,
  funcionario_id uuid REFERENCES public.funcionarios(id) ON DELETE SET NULL,
  data_emprestimo date NOT NULL DEFAULT current_date, prevista_devolucao date, data_devolucao date,
  observacoes text, anexo_url text, created_by uuid, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.ativo_manutencoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ativo_id uuid NOT NULL REFERENCES public.ativos(id) ON DELETE CASCADE,
  tipo text NOT NULL DEFAULT 'preventiva', descricao text, data date NOT NULL DEFAULT current_date,
  custo numeric, proxima_em date, created_by uuid, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.ativo_transferencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ativo_id uuid NOT NULL REFERENCES public.ativos(id) ON DELETE CASCADE,
  obra_origem_id uuid REFERENCES public.obras(id) ON DELETE SET NULL,
  obra_destino_id uuid NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pendente', motivo text, solicitado_por uuid, aprovado_por uuid,
  criado_em timestamptz, decidido_em timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.epi_movimentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  epi_id uuid NOT NULL REFERENCES public.epis(id) ON DELETE CASCADE,
  funcionario_id uuid REFERENCES public.funcionarios(id) ON DELETE SET NULL,
  tipo epi_movimento_tipo NOT NULL, quantidade numeric NOT NULL DEFAULT 1,
  data_movimento date NOT NULL DEFAULT current_date, data_vencimento date,
  motivo_retirada text, observacoes text, created_by uuid, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.material_movimentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id uuid NOT NULL REFERENCES public.materiais(id) ON DELETE CASCADE,
  obra_id uuid REFERENCES public.obras(id) ON DELETE SET NULL,
  tipo text NOT NULL, quantidade numeric NOT NULL,
  data date NOT NULL DEFAULT current_date, observacoes text, created_by uuid, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.ferramenta_emprestimos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ferramenta_id uuid NOT NULL REFERENCES public.ferramentas(id) ON DELETE CASCADE,
  funcionario_id uuid REFERENCES public.funcionarios(id) ON DELETE SET NULL,
  data_emprestimo date NOT NULL DEFAULT current_date, prevista_devolucao date, data_devolucao date,
  observacoes text, anexo_url text, created_by uuid, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.funcionario_documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funcionario_id uuid NOT NULL REFERENCES public.funcionarios(id) ON DELETE CASCADE,
  nome text NOT NULL, storage_path text NOT NULL, tipo text, tamanho integer, uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.funcionario_treinamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funcionario_id uuid NOT NULL REFERENCES public.funcionarios(id) ON DELETE CASCADE,
  nome text NOT NULL, data_realizacao date, data_validade date, observacoes text,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.obra_vencimentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id uuid NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  nome text NOT NULL, data_emissao date, data_vencimento date, observacoes text,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.documento_pastas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL, escopo text NOT NULL, obra_id uuid, parent_id uuid REFERENCES public.documento_pastas(id) ON DELETE CASCADE,
  user_id uuid, created_by uuid, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL, storage_path text NOT NULL, escopo text NOT NULL,
  pasta_id uuid REFERENCES public.documento_pastas(id) ON DELETE SET NULL,
  obra_id uuid, user_id uuid, mime text, tamanho integer, created_by uuid, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.tarefa_execucoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tarefa_id uuid NOT NULL REFERENCES public.tarefas(id) ON DELETE CASCADE,
  executor_id uuid, executor_nome text, observacao text, executado_em timestamptz NOT NULL DEFAULT now(),
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4) RLS (habilita e libera para service_role + authenticated basico)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.obras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funcionarios ENABLE ROW LEVEL SECURITY;
-- habilita RLS nas demais (anon nao acessa, authenticated via policies permissivas para nao quebrar app)
DO $$ DECLARE t text; BEGIN FOR t IN SELECT unnest(ARRAY['epis','materiais','ferramentas','ativos','tarefas','contas_financeiras','adiantamentos','notifications','user_roles','user_obras','custom_roles','custom_role_module_permissions','user_custom_roles','user_module_permissions','system_role_labels','system_role_module_permissions','adiantamento_despesas','ativo_emprestimos','ativo_manutencoes','ativo_transferencias','epi_movimentos','material_movimentos','ferramenta_emprestimos','funcionario_documentos','funcionario_treinamentos','obra_vencimentos','documento_pastas','documentos','tarefa_execucoes','permission_audit_log']) LOOP EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t); END LOOP; END $$;

-- Policies permissivas para authenticated (ajuste fino pode ser reaplicado pelas migrations posteriores)
DROP POLICY IF EXISTS "allow_all_authenticated" ON public.profiles;
CREATE POLICY "allow_all_authenticated" ON public.profiles FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_authenticated" ON public.obras;
CREATE POLICY "allow_all_authenticated" ON public.obras FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_all_authenticated" ON public.funcionarios;
CREATE POLICY "allow_all_authenticated" ON public.funcionarios FOR ALL TO authenticated USING (true) WITH CHECK (true);
-- policies genericas para as demais
DO $$ DECLARE t text; BEGIN FOR t IN SELECT unnest(ARRAY['epis','materiais','ferramentas','ativos','tarefas','contas_financeiras','adiantamentos','notifications','user_roles','user_obras','custom_roles','custom_role_module_permissions','user_custom_roles','user_module_permissions','system_role_labels','system_role_module_permissions','adiantamento_despesas','ativo_emprestimos','ativo_manutencoes','ativo_transferencias','epi_movimentos','material_movimentos','ferramenta_emprestimos','funcionario_documentos','funcionario_treinamentos','obra_vencimentos','documento_pastas','documentos','tarefa_execucoes','permission_audit_log']) LOOP EXECUTE format('DROP POLICY IF EXISTS "allow_all_authenticated" ON public.%I', t); EXECUTE format('CREATE POLICY "allow_all_authenticated" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t); END LOOP; END $$;

-- 5) TRIGGERS updated_at
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
DO $$ DECLARE t text; BEGIN FOR t IN SELECT unnest(ARRAY['profiles','obras','funcionarios','epis','materiais','ferramentas','ativos','tarefas','contas_financeiras','adiantamentos','custom_roles','custom_role_module_permissions','user_module_permissions','adiantamento_despesas','funcionario_treinamentos','obra_vencimentos','tarefa_execucoes']) LOOP EXECUTE format('DROP TRIGGER IF EXISTS trg_touch_%I ON public.%I', t, t); EXECUTE format('CREATE TRIGGER trg_touch_%I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at()', t, t); END LOOP; END $$;

-- 6) STORAGE bucket anexos
INSERT INTO storage.buckets (id, name, public) VALUES ('anexos','anexos', false) ON CONFLICT (id) DO NOTHING;

-- 7) FUNCOES essenciais (stubs para app nao quebrar)
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN INSERT INTO public.profiles (id, nome, email) VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email,'@',1)), NEW.email) ON CONFLICT (id) DO NOTHING; RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.ensure_profile() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE _uid uuid := auth.uid(); BEGIN IF _uid IS NULL THEN RETURN; END IF; INSERT INTO public.profiles (id, nome, email) SELECT u.id, COALESCE(NULLIF(u.raw_user_meta_data->>'nome',''), split_part(u.email,'@',1)), u.email FROM auth.users u WHERE u.id=_uid ON CONFLICT (id) DO NOTHING; END; $$;
CREATE OR REPLACE FUNCTION public.is_admin_or_gestor(_uid uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_uid AND role IN ('admin','gestor')); $$;
CREATE OR REPLACE FUNCTION public.has_role(_uid uuid, _role app_role) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_uid AND role=_role); $$;
CREATE OR REPLACE FUNCTION public.has_obra_access(_uid uuid, _obra uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ SELECT public.is_admin_or_gestor(_uid) OR EXISTS (SELECT 1 FROM public.user_obras WHERE user_id=_uid AND obra_id=_obra); $$;
CREATE OR REPLACE FUNCTION public.can_module(_uid uuid, _module text, _action text) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ SELECT public.is_admin_or_gestor(_uid) OR EXISTS (SELECT 1 FROM public.user_module_permissions WHERE user_id=_uid AND module=_module AND ((_action='view' AND can_view) OR (_action='edit' AND can_edit) OR (_action='delete' AND can_delete))); $$;
CREATE OR REPLACE FUNCTION public.list_profile_directory() RETURNS TABLE(id uuid, nome text, avatar_url text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT p.id, p.nome, p.avatar_url FROM public.profiles p WHERE auth.uid() IS NOT NULL; $$;
CREATE OR REPLACE FUNCTION public.gerar_notificacoes_vencimentos() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN RETURN 0; END; $$;

-- fim
