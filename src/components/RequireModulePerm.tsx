import { Link } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useModulePerm, usePermissionsLoading, type AppModule } from "@/lib/permissions";

/**
 * Barreira de permissão por módulo.
 * - Enquanto as permissões carregam, exibe skeleton (nunca libera acesso).
 * - Sem `can_view`, bloqueia a página mesmo com acesso via URL/dashboard.
 */
export function RequireModulePerm({ module, children }: { module: AppModule; children: ReactNode }) {
  const permsLoading = usePermissionsLoading();
  const perm = useModulePerm(module);

  if (permsLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!perm.can_view) {
    return (
      <Card className="p-8 text-center space-y-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
          <ShieldAlert className="h-6 w-6 text-destructive" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Acesso restrito</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Você não tem permissão para visualizar este módulo. Fale com o administrador para
            liberar o acesso.
          </p>
        </div>
        {module !== "dashboard" && (
          <Link to="/dashboard">
            <Button variant="outline" size="sm">
              Voltar ao Dashboard
            </Button>
          </Link>
        )}
      </Card>
    );
  }

  return <>{children}</>;
}
