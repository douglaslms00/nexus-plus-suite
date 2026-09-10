-- Garante que matricula e data_nascimento existam em public.funcionarios.
-- A migration 20260826000000 criou matricula localmente mas o banco remoto
-- ficou sem a coluna (types.ts desatualizado), então a UI mostrava "—" e o
-- salvamento descartava o campo com aviso de "schema cache".
ALTER TABLE public.funcionarios
  ADD COLUMN IF NOT EXISTS matricula text,
  ADD COLUMN IF NOT EXISTS data_nascimento date;

-- Recarrega o cache do PostgREST para a nova coluna aparecer no select("*")
NOTIFY pgrst, 'reload schema';
