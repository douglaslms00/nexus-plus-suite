-- Solicitação de arquivos P2P entre usuários + ciclo de vida 48h.
-- Usuário A (solicitante) -> Usuário B (remetente) -> upload -> expira em 48h -> purge automático.
-- Bucket utilizado: anexos (privado), prefixo: tarefas-solicitacoes/<solicitacao_id>/

-- 1. Tabela de solicitações
CREATE TABLE IF NOT EXISTS public.tarefas_solicitacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tarefa_id uuid REFERENCES public.tarefas(id) ON DELETE CASCADE,
  solicitante_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  remetente_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome_arquivo_esperado text NOT NULL CHECK (char_length(nome_arquivo_esperado) BETWEEN 2 AND 200),
  descricao text,
  status text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'enviada', 'excluida', 'cancelada')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tarefas_solicitacoes_usuarios_diferentes CHECK (solicitante_id <> remetente_id)
);

CREATE INDEX IF NOT EXISTS idx_tarefas_solic_remetente ON public.tarefas_solicitacoes(remetente_id, status);
CREATE INDEX IF NOT EXISTS idx_tarefas_solic_solicitante ON public.tarefas_solicitacoes(solicitante_id, status);
CREATE INDEX IF NOT EXISTS idx_tarefas_solic_tarefa ON public.tarefas_solicitacoes(tarefa_id);

-- 2. Tabela de arquivos enviados (1:1 com solicitação)
CREATE TABLE IF NOT EXISTS public.arquivos_enviados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitacao_id uuid NOT NULL UNIQUE REFERENCES public.tarefas_solicitacoes(id) ON DELETE CASCADE,
  storage_path text NOT NULL CHECK (storage_path LIKE 'tarefas-solicitacoes/%'),
  nome_original text NOT NULL,
  mime_type text,
  tamanho_bytes int NOT NULL CHECK (tamanho_bytes > 0 AND tamanho_bytes <= 2097152),
  enviado_em timestamptz NOT NULL DEFAULT now(),
  expira_em timestamptz NOT NULL DEFAULT (now() + interval '48 hours'),
  status text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'excluido')),
  excluido_em timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_arquivos_enviados_solic ON public.arquivos_enviados(solicitacao_id);
CREATE INDEX IF NOT EXISTS idx_arquivos_enviados_expira ON public.arquivos_enviados(expira_em) WHERE status = 'ativo';

-- 3. updated_at automático
CREATE OR REPLACE FUNCTION public.touch_tarefas_solicitacoes_updated()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_touch_solic_updated ON public.tarefas_solicitacoes;
CREATE TRIGGER trg_touch_solic_updated
  BEFORE UPDATE ON public.tarefas_solicitacoes
  FOR EACH ROW EXECUTE FUNCTION public.touch_tarefas_solicitacoes_updated();

-- 4. Garante expira_em = enviado_em + 48h (fonte única da verdade)
CREATE OR REPLACE FUNCTION public.set_arquivo_expiracao_48h()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.enviado_em := COALESCE(NEW.enviado_em, now());
  NEW.expira_em := NEW.enviado_em + interval '48 hours';
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_set_arquivo_expiracao ON public.arquivos_enviados;
CREATE TRIGGER trg_set_arquivo_expiracao
  BEFORE INSERT ON public.arquivos_enviados
  FOR EACH ROW EXECUTE FUNCTION public.set_arquivo_expiracao_48h();

-- 5. Notifica Usuário B ao criar solicitação (reusa public.notifications)
CREATE OR REPLACE FUNCTION public.notify_tarefa_solicitacao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  INSERT INTO public.notifications (user_id, tipo, titulo, mensagem, ref_id, ref_table, link)
  VALUES (
    NEW.remetente_id,
    'arquivo_solicitado',
    'Novo arquivo solicitado',
    'Solicitado: ' || NEW.nome_arquivo_esperado,
    NEW.id,
    'tarefas_solicitacoes',
    '/tarefas?tab=solicitacoes'
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_tarefa_solic ON public.tarefas_solicitacoes;
CREATE TRIGGER trg_notify_tarefa_solic
  AFTER INSERT ON public.tarefas_solicitacoes
  FOR EACH ROW EXECUTE FUNCTION public.notify_tarefa_solicitacao();

-- 6. Função de purga (TTL): chamada pelo Cron/Worker com service_role.
--    Deleta o registro do arquivo; o binário no storage é removido pelo Worker
--    (storage.objects exige service_role via API, não via SQL puro).
CREATE OR REPLACE FUNCTION public.purgar_arquivos_expirados()
RETURNS TABLE (arquivo_id uuid, storage_path text, solicitacao_id uuid)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  RETURN QUERY
  WITH expirados AS (
    SELECT a.id, a.storage_path, a.solicitacao_id
    FROM public.arquivos_enviados a
    WHERE a.status = 'ativo'
      AND a.expira_em <= now()
    ORDER BY a.expira_em ASC
    LIMIT 200
    FOR UPDATE SKIP LOCKED
  ),
  marcados AS (
    UPDATE public.arquivos_enviados a
    SET status = 'excluido', excluido_em = now()
    FROM expirados e
    WHERE a.id = e.id
    RETURNING a.id, a.storage_path, a.solicitacao_id
  ),
  sol_upd AS (
    UPDATE public.tarefas_solicitacoes s
    SET status = 'excluida', updated_at = now()
    FROM marcados m
    WHERE s.id = m.solicitacao_id AND s.status = 'enviada'
    RETURNING s.id
  )
  SELECT m.id, m.storage_path, m.solicitacao_id FROM marcados m;
END $$;

-- 7. RLS: apenas solicitante (A) e remetente (B) enxergam a solicitação/arquivo
ALTER TABLE public.tarefas_solicitacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arquivos_enviados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tarefas_solicitacoes_p2p" ON public.tarefas_solicitacoes;
CREATE POLICY "tarefas_solicitacoes_p2p" ON public.tarefas_solicitacoes
  FOR ALL TO authenticated
  USING (auth.uid() = solicitante_id OR auth.uid() = remetente_id)
  WITH CHECK (auth.uid() = solicitante_id OR auth.uid() = remetente_id);

DROP POLICY IF EXISTS "arquivos_enviados_p2p" ON public.arquivos_enviados;
CREATE POLICY "arquivos_enviados_p2p" ON public.arquivos_enviados
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tarefas_solicitacoes s
      WHERE s.id = arquivos_enviados.solicitacao_id
        AND (s.solicitante_id = auth.uid() OR s.remetente_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tarefas_solicitacoes s
      WHERE s.id = arquivos_enviados.solicitacao_id
        AND (s.solicitante_id = auth.uid() OR s.remetente_id = auth.uid())
    )
  );

-- 8. Storage (bucket privado `anexos`): permite upload autenticado só no prefixo P2P.
--    Download NUNCA direto: feito via Signed URL curta após checagem de expira_em no backend.
DROP POLICY IF EXISTS "anexos_upload_p2p" ON storage.objects;
CREATE POLICY "anexos_upload_p2p" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'anexos' AND name LIKE 'tarefas-solicitacoes/%');

DROP POLICY IF EXISTS "anexos_delete_p2p_service" ON storage.objects;
-- Remoção física é feita com service_role (bypass RLS); policy abaixo libera
-- apenas leitura de metadados para donos via API autenticada se necessário.
-- Não criar policy SELECT pública: bucket permanece privado.
