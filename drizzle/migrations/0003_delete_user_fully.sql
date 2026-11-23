CREATE OR REPLACE FUNCTION public.admin_delete_user(_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','auth'
AS $f$
DECLARE r record;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Apenas admin pode excluir usuários'; END IF;
  IF _user_id = auth.uid() THEN RAISE EXCEPTION 'Você não pode excluir a si mesmo'; END IF;
  FOR r IN
    SELECT n.nspname sch, c.relname tbl, a.attname col, a.attnotnull nn
    FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_attribute a ON a.attrelid=k.conrelid AND a.attnum=k.conkey[1]
    WHERE k.contype='f' AND k.confrelid='auth.users'::regclass AND n.nspname='public'
      AND c.relname NOT IN ('profiles','user_roles')
  LOOP
    IF r.nn THEN EXECUTE format('DELETE FROM %I.%I WHERE %I = $1', r.sch, r.tbl, r.col) USING _user_id;
    ELSE EXECUTE format('UPDATE %I.%I SET %I = NULL WHERE %I = $1', r.sch, r.tbl, r.col, r.col) USING _user_id;
    END IF;
  END LOOP;
  DELETE FROM public.user_module_permissions WHERE user_id = _user_id;
  DELETE FROM public.user_roles WHERE user_id = _user_id;
  DELETE FROM public.profiles WHERE id = _user_id;
  DELETE FROM auth.users WHERE id = _user_id;
END $f$;