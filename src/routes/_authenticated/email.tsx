import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/email")({
  head: () => ({
    meta: [
      { title: "Configuração de E-mail | GestãoPro" },
      { name: "description", content: "Conecte a conta de e-mail da empresa ao GestãoPro." },
      { property: "og:title", content: "Configuração de E-mail | GestãoPro" },
      { property: "og:description", content: "Conecte a conta de e-mail da empresa ao GestãoPro." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EmailPage,
});

const vazio = {
  email: "",
  nome_remetente: "",
  usuario: "",
  senha: "",
  smtp_host: "smtp.hostinger.com",
  smtp_porta: 465,
  imap_host: "imap.hostinger.com",
  imap_porta: 993,
  ativo: true,
};

function EmailPage() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["email_config"],
    queryFn: async () => {
      const { data, error } = await supabase.from("email_config").select("*").maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const [f, setF] = useState(vazio);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (data) setF({ ...vazio, ...data, nome_remetente: data.nome_remetente ?? "" });
  }, [data]);

  const set = (k: keyof typeof vazio, v: string | number | boolean) => setF((p) => ({ ...p, [k]: v }));

  async function salvar() {
    if (!f.email || !f.usuario || !f.senha) return toast.error("Preencha e-mail, usuário e senha.");
    setSalvando(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("email_config").upsert({
      id: true,
      ...f,
      smtp_porta: Number(f.smtp_porta),
      imap_porta: Number(f.imap_porta),
      updated_at: new Date().toISOString(),
      updated_by: u.user?.id ?? null,
    });
    setSalvando(false);
    if (error) return toast.error("Não foi possível salvar: " + error.message);
    toast.success("Configuração de e-mail salva.");
    qc.invalidateQueries({ queryKey: ["email_config"] });
  }

  async function remover() {
    const { error } = await supabase.from("email_config").delete().eq("id", true);
    if (error) return toast.error(error.message);
    setF(vazio);
    toast.success("Conta de e-mail desconectada.");
    qc.invalidateQueries({ queryKey: ["email_config"] });
  }

  if (error) return <p className="p-6 text-destructive">Somente administradores podem configurar o e-mail.</p>;
  if (isLoading) return <p className="p-6 text-muted-foreground">Carregando…</p>;

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold">Configuração de E-mail</h1>
        <p className="text-sm text-muted-foreground">
          Conecte a conta de e-mail da empresa (Hostinger) para o sistema enviar e ler e-mails.
        </p>
      </div>

      <Card className="space-y-4 p-4">
        <h2 className="font-medium">Conta</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div><Label>E-mail</Label><Input value={f.email} onChange={(e) => { set("email", e.target.value); if (!f.usuario || f.usuario === f.email) set("usuario", e.target.value); }} placeholder="contato@suaempresa.com.br" /></div>
          <div><Label>Nome do remetente</Label><Input value={f.nome_remetente} onChange={(e) => set("nome_remetente", e.target.value)} placeholder="GestãoPro" /></div>
          <div><Label>Usuário</Label><Input value={f.usuario} onChange={(e) => set("usuario", e.target.value)} /></div>
          <div><Label>Senha do e-mail</Label><Input type="password" value={f.senha} onChange={(e) => set("senha", e.target.value)} autoComplete="new-password" /></div>
        </div>
      </Card>

      <Card className="space-y-4 p-4">
        <h2 className="font-medium">Servidores</h2>
        <div className="grid gap-3 md:grid-cols-4">
          <div className="md:col-span-3"><Label>Envio (SMTP)</Label><Input value={f.smtp_host} onChange={(e) => set("smtp_host", e.target.value)} /></div>
          <div><Label>Porta</Label><Input type="number" value={f.smtp_porta} onChange={(e) => set("smtp_porta", e.target.value)} /></div>
          <div className="md:col-span-3"><Label>Leitura (IMAP)</Label><Input value={f.imap_host} onChange={(e) => set("imap_host", e.target.value)} /></div>
          <div><Label>Porta</Label><Input type="number" value={f.imap_porta} onChange={(e) => set("imap_porta", e.target.value)} /></div>
        </div>
        <p className="text-xs text-muted-foreground">Valores padrão da Hostinger já preenchidos (SMTP 465 SSL, IMAP 993 SSL).</p>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Salvar configuração"}</Button>
        {data && <Button variant="outline" onClick={remover}>Desconectar</Button>}
      </div>
    </div>
  );
}
