CREATE TABLE public.funcionario_documentos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  funcionario_id UUID NOT NULL REFERENCES public.funcionarios(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  tipo TEXT,
  storage_path TEXT NOT NULL,
  tamanho BIGINT,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.funcionario_documentos TO authenticated;
GRANT ALL ON public.funcionario_documentos TO service_role;

ALTER TABLE public.funcionario_documentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ver documentos por obra"
  ON public.funcionario_documentos FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.funcionarios f
    WHERE f.id = funcionario_id
      AND (f.obra_id IS NULL OR public.has_obra_access(auth.uid(), f.obra_id))
  ));

CREATE POLICY "Inserir documentos (gestor/admin)"
  ON public.funcionario_documentos FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_gestor(auth.uid()));

CREATE POLICY "Atualizar documentos (gestor/admin)"
  ON public.funcionario_documentos FOR UPDATE TO authenticated
  USING (public.is_admin_or_gestor(auth.uid()));

CREATE POLICY "Excluir documentos (admin)"
  ON public.funcionario_documentos FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_funcionario_documentos_funcionario ON public.funcionario_documentos(funcionario_id);

-- Políticas no bucket "anexos" para a pasta funcionarios/
CREATE POLICY "Funcionarios anexos - ler"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'anexos' AND (storage.foldername(name))[1] = 'funcionarios');

CREATE POLICY "Funcionarios anexos - upload (gestor/admin)"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'anexos' AND (storage.foldername(name))[1] = 'funcionarios' AND public.is_admin_or_gestor(auth.uid()));

CREATE POLICY "Funcionarios anexos - excluir (admin)"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'anexos' AND (storage.foldername(name))[1] = 'funcionarios' AND public.has_role(auth.uid(), 'admin'));