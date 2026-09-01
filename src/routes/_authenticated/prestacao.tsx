import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ExternalLink, Loader2, Receipt } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/prestacao")({
  component: PrestacaoPage,
});

function PrestacaoPage() {
  const [loading, setLoading] = useState(false);

  const acessarPrestaContas = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    
    // We append the access token to the URL so the target Lovable app can read it and authenticate automatically
    // The target app needs to extract this token and set it using supabase.auth.setSession()
    let url = "https://prestacontasms.lovable.app/auth";
    if (session?.access_token) {
      url += `?access_token=${session.access_token}&refresh_token=${session.refresh_token}`;
    }
    
    window.open(url, "_blank");
    setLoading(false);
  };

  useEffect(() => {
    // Optionally auto-redirect when opening this page
    // acessarPrestaContas();
  }, []);

  return (
    <div className="flex h-[80vh] items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-lg text-center">
        <CardHeader className="space-y-4">
          <div className="mx-auto h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Receipt className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Módulo de Prestação de Contas</CardTitle>
          <CardDescription>
            A gestão de prestação de contas foi movida para um sistema dedicado.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-8">
            Clique no botão abaixo para acessar o sistema. Você não precisará fazer login novamente se já estiver conectado aqui.
          </p>
          <Button 
            size="lg" 
            className="w-full h-14 text-base" 
            onClick={acessarPrestaContas}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-5 w-5 mr-2 animate-spin" />
            ) : (
              <ExternalLink className="h-5 w-5 mr-2" />
            )}
            Acessar Presta Contas
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
