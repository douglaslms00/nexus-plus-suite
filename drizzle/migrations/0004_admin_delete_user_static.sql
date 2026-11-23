CREATE OR REPLACE FUNCTION public.admin_delete_user(_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','auth'
AS $f$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Apenas admin pode excluir usuários'; END IF;
  IF _user_id = auth.uid() THEN RAISE EXCEPTION 'Você não pode excluir a si mesmo'; END IF;
  UPDATE public.arquivos_enviados SET created_by = NULL WHERE created_by = _user_id;
  DELETE FROM public.arquivos_enviados WHERE solicitacao_id IN (SELECT id FROM public.tarefas_solicitacoes WHERE solicitante_id = _user_id OR remetente_id = _user_id);
  DELETE FROM public.tarefas_solicitacoes WHERE solicitante_id = _user_id OR remetente_id = _user_id;
  DELETE FROM public.compromissos WHERE user_id = _user_id;
  UPDATE public.epi_movimentos SET created_by = NULL WHERE created_by = _user_id;
  UPDATE public.funcionario_documentos SET uploaded_by = NULL WHERE uploaded_by = _user_id;
  UPDATE public.funcionarios SET created_by = NULL WHERE created_by = _user_id;
  UPDATE public.tarefas SET created_by = NULL WHERE created_by = _user_id;
  UPDATE public.tarefas SET responsavel_id = NULL WHERE responsavel_id = _user_id;
  UPDATE public.adiantamentos SET responsavel_id = NULL WHERE responsavel_id = _user_id;
  DELETE FROM public.user_custom_roles WHERE user_id = _user_id;
  DELETE FROM public.user_obras WHERE user_id = _user_id;
  DELETE FROM public.user_module_permissions WHERE user_id = _user_id;
  DELETE FROM public.user_roles WHERE user_id = _user_id;
  DELETE FROM public.profiles WHERE id = _user_id;
  DELETE FROM auth.users WHERE id = _user_id;
END $f$;