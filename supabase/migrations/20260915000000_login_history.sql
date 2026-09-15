-- Histórico de logins por perfil (tela de Acessos / Usuários).
-- O frontend registra uma linha a cada nova sessão (AppShell) e a tela de
-- Acessos exibe o histórico por usuário + aba global "Logins".
-- Seguro para aplicar múltiplas vezes (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS public.login_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email text,
  login_at timestamptz NOT NULL DEFAULT now(),
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_login_history_user ON public.login_history (user_id, login_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_history_at ON public.login_history (login_at DESC);

ALTER TABLE public.login_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "login_history_select" ON public.login_history;
CREATE POLICY "login_history_select" ON public.login_history
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.user_roles r
      WHERE r.user_id = auth.uid() AND r.role IN ('admin', 'gestor')
    )
  );

DROP POLICY IF EXISTS "login_history_insert_own" ON public.login_history;
CREATE POLICY "login_history_insert_own" ON public.login_history
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
