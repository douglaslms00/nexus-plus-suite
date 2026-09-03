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
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setNome(profile.nome ?? "");
      setSetor((profile as any).setor ?? "");
      setEmail((profile as any).email ?? user?.email ?? "");
      setAvatarUrl((profile as any).avatar_url ?? null);
    }
  }, [profile, user?.email]);

  const validarSenha = (senha: string) => {
    let pontos = 0;
    const requisitos = {
      minuscula: /[a-z]/.test(senha),
      maiuscula: /[A-Z]/.test(senha),
      numero: /[0-9]/.test(senha),
      especial: /[!@#$%^&*(),.?":{}|<>]/.test(senha),
    };
    Object.values(requisitos).forEach((válido) => { if (válido) pontos++; });

    if (senha.length >= 8 && pontos >= 3) return { strength: "forte", requisitos };
    if (senha.length >= 6 && pontos >= 2) return { strength: "media", requisitos };
    return { strength: "fraca", requisitos };
  };

  const saveProfile = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("profiles")
        .update({ nome, setor, avatar_url: avatarUrl } as any)
        .eq("id", user!.id);
      if (error) throw error;
      if (email && email !== user?.email) {
        const { error: eErr } = await supabase.auth.updateUser({ email });
        if (eErr) throw eErr;
      }
    },
    onSuccess: () => {
      toast.success("Perfil atualizado");
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["currentUser"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const changePwd = useMutation({
    mutationFn: async () => {
      const { strength, requisitos } = validarSenha(pwd);
      if (pwd.length < 6) throw new Error("Senha precisa ter ao menos 6 caracteres");
      if (pwd !== pwd2) throw new Error("Senhas não conferem");
      if (strength === "fraca") throw new Error("Senha fraca: deve ter no mínimo 8 caracteres, letras maiúsculas e minúsculas, números e caracteres especiais");
      const { error } = await supabase.auth.updateUser({ password: pwd });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Senha alterada"); setPwd(""); setPwd2(""); },
    onError: (e: any) => toast.error(e.message),
  });

  const onAvatar = async (file: File) => {
    const ext = file.name.split(".").pop();
    const path = `avatars/${user!.id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("anexos").upload(path, file, { upsert: true });
    if (error) { toast.error(error.message); return; }
    const { data } = await supabase.storage.from("anexos").createSignedUrl(path, 60 * 60 * 24 * 365);
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
                <input type="file" accept="image/*" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) onAvatar(f); e.target.value = ""; }} />
                <Button asChild variant="outline" size="sm"><span><Upload className="h-4 w-4" /> Trocar foto</span></Button>
              </label>
            </div>
            <div><Label>Nome</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} /></div>
            <div><Label>Setor</Label><Input value={setor} onChange={(e) => setSetor(e.target.value)} /></div>
            <div><Label>E-mail</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <Button onClick={() => saveProfile.mutate()} disabled={saveProfile.isPending}>
              {saveProfile.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </Card>
        </TabsContent>

        <TabsContent value="senha">
          <Card className="p-6 space-y-4">
            <div><Label>Nova senha</Label><Input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} /></div>
            <div><Label>Confirmar senha</Label><Input type="password" value={pwd2} onChange={(e) => setPwd2(e.target.value)} /></div>
<div className="text-xs mt-1">
              <span className={validarSenha(pwd).strength === "forte" ? "text-success" : validarSenha(pwd).strength === "media" ? "text-warning" : "text-destructive">
                {validarSenha(pwd).strength}
              </span>
              <div className="mt-1 grid grid-cols-2 gap-1">
                {validarSenha(pwd).requisitos.minuscula && <span className="text-success">✓ Letra minúscula</span>}
                {!validarSenha(pwd).requisitos.minuscula && <span className="text-destructive">✗ Letra minúscula</span>}
                {validarSenha(pwd).requisitos.maiuscula && <span className="text-success">✓ Letra maiúscula</span>}
                {!validarSenha(pwd).requisitos.maiuscula && <span className="text-destructive">✗ Letra maiúscula</span>}
                {validarSenha(pwd).requisitos.numero && <span className="text-success">✓ Número</span>}
                {!validarSenha(pwd).requisitos.numero && <span className="text-destructive">✗ Número</span>}
                {validarSenha(pwd).requisitos.especial && <span className="text-success">✓ Caracteres especiais</span>}
                {!validarSenha(pwd).requisitos.especial && <span className="text-destructive">✗ Caracteres especiais</span>}
              </div>
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