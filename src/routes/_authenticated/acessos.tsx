import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isAdmin, useUserRoles, type AppRole } from "@/lib/permissions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/acessos")({
  component: AcessosPage,
});

const ROLES: AppRole[] = ["admin", "gestor", "financeiro", "colaborador"];

function AcessosPage() {
  const qc = useQueryClient();
  const { data: roles } = useUserRoles();

  const { data: usuarios = [] } = useQuery({
    queryKey: ["all-users"],
    queryFn: async () => {
      const { data: profs } = await supabase.from("profiles").select("id, nome, email");
      const { data: r } = await supabase.from("user_roles").select("user_id, role");
      return (profs ?? []).map((p: any) => ({
        ...p, roles: (r ?? []).filter((x: any) => x.user_id === p.id).map((x: any) => x.role),
      }));
    },
    enabled: isAdmin(roles),
  });

  const toggle = useMutation({
    mutationFn: async ({ user_id, role, grant }: { user_id: string; role: AppRole; grant: boolean }) => {
      const { error } = await supabase.rpc("admin_set_role", { _user_id: user_id, _role: role, _grant: grant });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Papéis atualizados"); qc.invalidateQueries({ queryKey: ["all-users"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  if (!isAdmin(roles)) {
    return <Card className="p-8 text-center text-muted-foreground">Acesso restrito a administradores.</Card>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Acessos</h1>
        <p className="text-muted-foreground">Gerencie os papéis dos usuários do sistema.</p>
      </div>
      <div className="space-y-3">
        {usuarios.map((u: any) => (
          <Card key={u.id} className="p-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <p className="font-medium">{u.nome}</p>
                <p className="text-xs text-muted-foreground">{u.email}</p>
              </div>
              <div className="flex gap-2 flex-wrap">
                {ROLES.map((r) => {
                  const has = u.roles.includes(r);
                  return (
                    <Button key={r} size="sm" variant={has ? "default" : "outline"}
                      onClick={() => toggle.mutate({ user_id: u.id, role: r, grant: !has })}>
                      {r}
                    </Button>
                  );
                })}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
