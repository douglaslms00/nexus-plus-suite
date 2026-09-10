import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser, useProfile } from "@/lib/permissions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Upload } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/perfil")({ component: PerfilPage });

function PerfilPage() {
  const qc = useQueryClient();
  const { data: user } = useCurrentUser();
  const { data: profile } = useProfile();

  const [nome, setNome] = useState("");
  const [setor, setSetor] = useState("");
  const [email, setEmail] = useState("");
  const [cpf, setCpf] = useState("");
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  function onlyDigits(v: string) {
    return v.replace(/\D/g, "");
  }
  function formatCpf(v: string) {
    const d = onlyDigits(v).slice(0, 11);
    if (d.length <= 3) return d;
    if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
    if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }

  function validarCPF(cpf: string): boolean {
    const c = onlyDigits(cpf);
    if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
    let sum = 0;
    for (let i = 0; i < 9; i++) sum += parseInt(c[i]) * (10 - i);
    let rest = (sum * 10) % 11;
    if (rest === 10 || rest === 11) rest = 0;
    if (rest !== parseInt(c[9])) return false;
    sum = 0;
    for (let i = 0; i < 10; i++) sum += parseInt(c[i]) * (11 - i);
    rest = (sum * 10) % 11;
    if (rest === 10 || rest === 11) rest = 0;
    if (rest !== parseInt(c[10])) return false;
    return true;
  }

  function mensagemAmigavel(e: any): string {
    const raw = e?.message ?? String(e ?? "Erro desconhecido");
    const code = e?.code ?? "";
    // CPF duplicado (índice único profiles_cpf_unique)
    if (
      code === "23505" ||
      /profiles_cpf_unique/i.test(raw) ||
      (/duplicate key/i.test(raw) && /cpf/i.test(raw))
    ) {
      return "Este CPF já está cadastrado em outra conta. Verifique o número digitado.";
    }
    if (code === "42501" || /permission denied|not allowed|policy|RLS|row-level/i.test(raw)) {
      return "Sem permissão para salvar o perfil. Aplique a migration 20260910120000_fix_profiles_update_perfil no Supabase e tente de novo.";
    }
    if (/invalid email|email.*invalid|Unable to validate email/i.test(raw)) {
      return "E-mail inválido. Verifique o endereço digitado.";
    }
    if (/already.*(use|registered|exists)|already in use/i.test(raw)) {
      return "Dados salvos, mas o e-mail não foi alterado: este e-mail já está em uso por outra conta.";
    }
    if (/rate limit|too many|exceeded/i.test(raw)) {
      return "Dados salvos, mas o e-mail não foi alterado agora: limite de tentativas excedido. Aguarde alguns minutos.";
    }
    if (/confirmation|confirm.*email|verify/i.test(raw)) {
      return "Dados salvos! Verifique seu e-mail (antigo e novo) para confirmar a troca de e-mail.";
    }
    return raw;
  }

  useEffect(() => {
    if (profile) {
      setNome(profile.nome ?? "");
      setSetor((profile as any).setor ?? "");
      setCpf((profile as any).cpf ? formatCpf((profile as any).cpf) : "");
      setAvatarUrl((profile as any).avatar_url ?? null);
    }
  }, [profile]);

  // E-mail vem do Auth (profiles.email não tem SELECT para o próprio usuário),
  // então sincroniza separadamente a partir da sessão.
  useEffect(() => {
    if (user?.email) setEmail((prev) => prev || user.email!);
  }, [user?.email]);

  const validarSenha = (senha: string) => {
    let pontos = 0;
    const requisitos = {
      minuscula: /[a-z]/.test(senha),
      maiuscula: /[A-Z]/.test(senha),
      numero: /[0-9]/.test(senha),
      especial: /[!@#$%^&*(),.?":{}|<>]/.test(senha),
    };
    Object.values(requisitos).forEach((válido) => {
      if (válido) pontos++;
    });

    if (senha.length >= 8 && pontos >= 3) return { strength: "forte", requisitos };
    if (senha.length >= 6 && pontos >= 2) return { strength: "media", requisitos };
    return { strength: "fraca", requisitos };
  };

  const saveProfile = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("Sessão ainda carregando. Aguarde e tente de novo.");
      const nomeTrim = nome.trim();
      if (!nomeTrim) throw new Error("Informe seu nome.");
      const emailTrim = email.trim().toLowerCase();
      if (emailTrim && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim))
        throw new Error("E-mail inválido. Verifique o endereço digitado.");
      const cpfDigits = onlyDigits(cpf);
      if (cpf && cpfDigits.length !== 11) throw new Error("CPF deve ter 11 dígitos.");
      if (cpfDigits && !validarCPF(cpfDigits))
        throw new Error("CPF inválido. Verifique o número digitado.");
      const setorTrim = setor.trim();

      // 1) Salva dados do perfil (colunas com GRANT UPDATE para o próprio usuário).
      //    Não inclui `email`: profiles.email não tem UPDATE/SELECT para
      //    authenticated, a troca de e-mail é feita via Auth abaixo.
      const { error } = await supabase
        .from("profiles")
        .update({
          nome: nomeTrim,
          setor: setorTrim || null,
          avatar_url: avatarUrl,
          cpf: cpfDigits || null,
        } as any)
        .eq("id", user.id);
      if (error) throw error;

      // 2) Sincroniza CPF nos metadados do Auth (não bloqueia o save se falhar).
      if (cpfDigits) {
        const { error: metaErr } = await supabase.auth.updateUser({ data: { cpf: cpfDigits } } as any);
        if (metaErr) console.warn(metaErr.message);
      }

      // 3) Troca de e-mail via Auth (pode exigir confirmação por e-mail).
      if (emailTrim && emailTrim !== (user.email ?? "").toLowerCase()) {
        const { error: eErr } = await supabase.auth.updateUser({ email: emailTrim });
        if (eErr) {
          // Perfil já foi salvo acima; informa que só o e-mail ficou pendente.
          throw new Error(`Perfil salvo, mas o e-mail ficou pendente: ${mensagemAmigavel(eErr)}`);
        }
        return { emailChanged: true };
      }
      return { emailChanged: false };
    },
    onSuccess: (res) => {
      if (res?.emailChanged) {
        toast.success("Perfil atualizado! Verifique seu e-mail para confirmar a troca.");
      } else {
        toast.success("Perfil atualizado");
      }
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["currentUser"] });
    },
    onError: (e: any) => toast.error(mensagemAmigavel(e)),
  });

  const changePwd = useMutation({
    mutationFn: async () => {
      const { strength, requisitos } = validarSenha(pwd);
      if (pwd.length < 6) throw new Error("Senha precisa ter ao menos 6 caracteres");
      if (pwd !== pwd2) throw new Error("Senhas não conferem");
      if (strength === "fraca")
        throw new Error(
          "Senha fraca: deve ter no mínimo 8 caracteres, letras maiúsculas e minúsculas, números e caracteres especiais",
        );
      const { error } = await supabase.auth.updateUser({ password: pwd });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Senha alterada");
      setPwd("");
      setPwd2("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const onAvatar = async (file: File) => {
    const ext = file.name.split(".").pop();
    const path = `avatars/${user!.id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("anexos").upload(path, file, { upsert: true });
    if (error) {
      toast.error(error.message);
      return;
    }
    const { data } = await supabase.storage
      .from("anexos")
      .createSignedUrl(path, 60 * 60 * 24 * 365);
    setAvatarUrl(data?.signedUrl ?? null);
    toast.success("Avatar carregado. Salve para confirmar.");
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Meu perfil</h1>
        <p className="text-muted-foreground">Atualize seus dados, avatar e senha.</p>
      </div>

      <Tabs defaultValue="dados">
        <TabsList>
          <TabsTrigger value="dados">Dados</TabsTrigger>
          <TabsTrigger value="senha">Senha</TabsTrigger>
        </TabsList>

        <TabsContent value="dados" className="space-y-4">
          <Card className="p-6 space-y-4">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                {avatarUrl && <AvatarImage src={avatarUrl} />}
                <AvatarFallback>{(nome || "U").slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <label>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onAvatar(f);
                    e.target.value = "";
                  }}
                />
                <Button asChild variant="outline" size="sm">
                  <span>
                    <Upload className="h-4 w-4" /> Trocar foto
                  </span>
                </Button>
              </label>
            </div>
            <div>
              <Label>Nome</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
            <div>
              <Label>Setor</Label>
              <Input value={setor} onChange={(e) => setSetor(e.target.value)} />
            </div>
            <div>
              <Label>E-mail</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <Label>CPF (para login com CPF)</Label>
              <Input
                placeholder="000.000.000-00"
                value={cpf}
                onChange={(e) => setCpf(formatCpf(e.target.value))}
                maxLength={14}
              />
              {cpf && onlyDigits(cpf).length > 0 && onlyDigits(cpf).length !== 11 && (
                <p className="text-xs text-destructive mt-1">CPF deve ter 11 dígitos.</p>
              )}
              {cpf && onlyDigits(cpf).length === 11 && !validarCPF(cpf) && (
                <p className="text-xs text-destructive mt-1">CPF inválido. Verifique o número digitado.</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">Seu CPF será usado para permitir login com CPF.</p>
            </div>
            <Button
              onClick={() => saveProfile.mutate()}
              disabled={saveProfile.isPending || !user?.id}
            >
              {saveProfile.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </Card>
        </TabsContent>

        <TabsContent value="senha">
          <Card className="p-6 space-y-4">
            <div>
              <Label>Nova senha</Label>
              <Input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} />
            </div>
            <div>
              <Label>Confirmar senha</Label>
              <Input type="password" value={pwd2} onChange={(e) => setPwd2(e.target.value)} />
            </div>
            <div className="text-xs mt-1">
              <span
                className={
                  validarSenha(pwd).strength === "forte"
                    ? "text-success"
                    : validarSenha(pwd).strength === "media"
                      ? "text-warning"
                      : "text-destructive"
                }
              >
                {validarSenha(pwd).strength}
              </span>
              <div className="mt-1 grid grid-cols-2 gap-1">
                <span
                  className={
                    validarSenha(pwd).requisitos.minuscula ? "text-success" : "text-destructive"
                  }
                >
                  {validarSenha(pwd).requisitos.minuscula ? "✓" : "✗"} Letra minúscula
                </span>
                <span
                  className={
                    validarSenha(pwd).requisitos.maiuscula ? "text-success" : "text-destructive"
                  }
                >
                  {validarSenha(pwd).requisitos.maiuscula ? "✓" : "✗"} Letra maiúscula
                </span>
                <span
                  className={
                    validarSenha(pwd).requisitos.numero ? "text-success" : "text-destructive"
                  }
                >
                  {validarSenha(pwd).requisitos.numero ? "✓" : "✗"} Número
                </span>
                <span
                  className={
                    validarSenha(pwd).requisitos.especial ? "text-success" : "text-destructive"
                  }
                >
                  {validarSenha(pwd).requisitos.especial ? "✓" : "✗"} Caracteres especiais
                </span>
              </div>
            </div>

            <Button onClick={() => changePwd.mutate()} disabled={changePwd.isPending}>
              {changePwd.isPending ? "Alterando..." : "Alterar senha"}
            </Button>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
