-- Remoção da funcionalidade "Solicitação de arquivos entre usuários" (P2P com TTL 48h).
-- Remove tabelas, triggers, funções, policies e notificações órfãs.
-- A remoção dos binários no bucket `anexos` sob o prefixo `tarefas-solicitacoes/`
-- deve ser feita via Storage API com service_role (fora do SQL).

-- 1. Limpa notificações órfãs geradas pelo fluxo P2P
DELETE FROM public.notifications
WHERE ref_table = 'tarefas_solicitacoes'
   OR tipo IN ('arquivo_solicitado', 'arquivo_enviado');

-- 2. Remove policies de Storage criadas para o fluxo P2P
DROP POLICY IF EXISTS "anexos_upload_p2p" ON storage.objects;
DROP POLICY IF EXISTS "anexos_delete_p2p_service" ON storage.objects;

-- 3. Remove triggers
DROP TRIGGER IF EXISTS trg_notify_tarefa_solic ON public.tarefas_solicitacoes;
DROP TRIGGER IF EXISTS trg_touch_solic_updated ON public.tarefas_solicitacoes;
DROP TRIGGER IF EXISTS trg_set_arquivo_expiracao ON public.arquivos_enviados;

-- 4. Remove tabelas (arquivos_enviados referencia tarefas_solicitacoes)
DROP TABLE IF EXISTS public.arquivos_enviados CASCADE;
DROP TABLE IF EXISTS public.tarefas_solicitacoes CASCADE;

-- 5. Remove funções
DROP FUNCTION IF EXISTS public.notify_tarefa_solicitacao() CASCADE;
DROP FUNCTION IF EXISTS public.purgar_arquivos_expirados() CASCADE;
DROP FUNCTION IF EXISTS public.set_arquivo_expiracao_48h() CASCADE;
DROP FUNCTION IF EXISTS public.touch_tarefas_solicitacoes_updated() CASCADE;
