-- Correção: public.notifications.ref_id é uuid (não text).
-- A migration anterior usava NEW.id::text, o que gerava:
-- "column ref_id is of type uuid but expression is of type text".
-- Esta migration recria o trigger com o tipo correto (NEW.id sem cast).

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
