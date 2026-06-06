-- Atualiza handle_new_user para vincular automaticamente novos usuários à obra "GestãoPro"
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_default_obra UUID;
BEGIN
  INSERT INTO public.profiles (id, nome, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome', NEW.email), NEW.email);

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'colaborador');

  -- Vincula o novo usuário somente à obra padrão "GestãoPro".
  -- Admin pode liberar outras obras depois em Acessos.
  SELECT id INTO v_default_obra
  FROM public.obras
  WHERE lower(nome) IN ('gestaopro','gestão pro','gestaopro ','gestão pro ') OR nome ILIKE 'gest%pro%'
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_default_obra IS NOT NULL THEN
    INSERT INTO public.user_obras (user_id, obra_id)
    VALUES (NEW.id, v_default_obra)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

-- Restringe has_obra_access: NULL (todas as obras) só vale para admin/gestor.
CREATE OR REPLACE FUNCTION public.has_obra_access(_user_id uuid, _obra_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    public.has_role(_user_id, 'admin')
    OR public.has_role(_user_id, 'gestor')
    OR (_obra_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.user_obras WHERE user_id = _user_id AND obra_id = _obra_id
    ));
$function$;