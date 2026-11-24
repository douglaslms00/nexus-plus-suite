CREATE TABLE IF NOT EXISTS public.email_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  email text NOT NULL,
  nome_remetente text,
  usuario text NOT NULL,
  senha text NOT NULL,
  smtp_host text NOT NULL DEFAULT 'smtp.hostinger.com',
  smtp_porta integer NOT NULL DEFAULT 465,
  imap_host text NOT NULL DEFAULT 'imap.hostinger.com',
  imap_porta integer NOT NULL DEFAULT 993,
  ativo boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_config TO authenticated;
GRANT ALL ON public.email_config TO service_role;
ALTER TABLE public.email_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY email_config_admin_all ON public.email_config FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));