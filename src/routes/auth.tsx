import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Building2, Eye, EyeOff } from "lucide-react";

export const Route = createFileRoute("/auth")({
  ssr: false,
  component: AuthPage,
});

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

function isEmail(v: string) {
  return v.includes("@");
}

async function resolveEmail(identifier: string): Promise<string | null> {
  const trimmed = identifier.trim();
  if (isEmail(trimmed)) return trimmed.toLowerCase();
  const digits = onlyDigits(trimmed);
  if (digits.length !== 11) return null;
  const { data, error } = await (supabase as any).rpc("get_email_by_cpf", { cpf_input: trimmed });
  if (error) {
    if ((error as any)?.code === "PGRST202")
      console.warn(
        "[auth] RPC get_email_by_cpf ausente no banco. Aplique a migration 20260909120000_login_cpf_email.sql no Supabase.",
      );
    else console.warn("get_email_by_cpf error", error);
    return null;
  }
  if (!data) return null;
  // data pode ser string direta ou null
  return typeof data === "string" ? data : null;
}

function AuthPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const identifier = loginId.trim();
    if (!identifier) return toast.error("Informe e-mail ou CPF.");
    setLoading(true);
    try {
      const emailToUse = await resolveEmail(identifier);
      if (!emailToUse) {
        if (!isEmail(identifier)) {
          toast.error("CPF não encontrado ou não cadastrado. Verifique o CPF ou use seu e-mail.");
        } else {
          toast.error("E-mail não encontrado.");
        }
        setLoading(false);
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({ email: emailToUse, password });
      if (error) return toast.error(error.message);
      toast.success("Bem-vindo!");
      navigate({ to: "/dashboard", replace: true });
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    const identifier = loginId.trim();
    if (!identifier) {
      return toast.error("Preencha e-mail ou CPF para recuperar a senha.");
    }
    setLoading(true);
    const emailToUse = await resolveEmail(identifier);
    if (!emailToUse) {
      setLoading(false);
      if (!isEmail(identifier)) return toast.error("CPF não encontrado. Verifique o CPF cadastrado.");
      return toast.error("E-mail não encontrado.");
    }
    const { error } = await supabase.auth.resetPasswordForEmail(emailToUse, {
      redirectTo: `${window.location.origin}/auth?reset=true`,
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Instruções de recuperação de senha enviadas para seu e-mail!");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary via-primary to-sidebar-accent p-4">
      <Card className="w-full max-w-md shadow-2xl">
        <CardHeader className="text-center space-y-3">
          <div className="mx-auto h-14 w-14 rounded-xl bg-primary flex items-center justify-center">
            <Building2 className="h-7 w-7 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl">GestãoPro</CardTitle>
          <CardDescription>Sistema integrado de gestão de obra</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label htmlFor="login-identifier">E-mail ou CPF</Label>
              <Input
                id="login-identifier"
                type="text"
                required
                placeholder="seu@email.com ou 000.000.000-00"
                value={loginId}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v.includes("@") && /[0-9]/.test(v)) {
                    const digits = onlyDigits(v);
                    if (digits.length <= 11 && (v.length === 0 || /[0-9.\- ]/.test(v))) {
                      if (digits.length > 3 && !v.includes("@")) {
                        setLoginId(formatCpf(v));
                      } else {
                        setLoginId(v);
                      }
                      return;
                    }
                  }
                  setLoginId(v);
                }}
              />
              <p className="text-xs text-muted-foreground">Você pode entrar com e-mail ou CPF cadastrado.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="login-password">Senha</Label>
              <div className="relative">
                <Input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                type="button"
                variant="link"
                className="px-0 font-normal h-auto text-xs"
                onClick={handleForgotPassword}
                disabled={loading}
              >
                Esqueci minha senha
              </Button>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Entrando..." : "Entrar"}
            </Button>
          </form>
          <p className="text-xs text-muted-foreground text-center mt-5">
            Não tem acesso? Entre em contato com o administrador do sistema.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
