import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  isAdmin, useUserRoles, ALL_MODULES, effectivePerm,
  type AppRole, type AppModule, type ModulePerm, type CustomRole, type CustomRolePerm,
} from "@/lib/permissions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";


export const Route = createFileRoute("/_authenticated/acessos")({ component: AcessosPage });

const ROLES: AppRole[] = ["admin", "gestor", "financeiro", "colaborador"];

function AcessosPage() {
  const qc = useQueryClient();
  const { data: roles } = useUserRoles();

  const { data: usuarios = [] } = useQuery({
    queryKey: ["all-users-perms"],
    enabled: isAdmin(roles),
    queryFn: async () => {
      const [{ data: profs }, { data: r }, { data: perms }, { data: uobras }, { data: ucroles }] = await Promise.all([
        supabase.from("profiles").select("id, nome, email"),
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("user_module_permissions").select("user_id, module, can_view, can_edit, can_delete"),
        supabase.from("user_obras").select("user_id, obra_id"),
        (supabase as any).from("user_custom_roles").select("user_id, custom_role_id"),
      ]);
      return (profs ?? []).map((p: any) => ({
        ...p,
        roles: (r ?? []).filter((x: any) => x.user_id === p.id).map((x: any) => x.role) as AppRole[],
        perms: (perms ?? []).filter((x: any) => x.user_id === p.id) as ({ module: AppModule } & ModulePerm)[],
        obras: (uobras ?? []).filter((x: any) => x.user_id === p.id).map((x: any) => x.obra_id) as string[],
        customRoleIds: (ucroles ?? []).filter((x: any) => x.user_id === p.id).map((x: any) => x.custom_role_id) as string[],
      }));
    },
  });

  const { data: obrasAll = [] } = useQuery({
    queryKey: ["obras-all-admin"],
    enabled: isAdmin(roles),
    queryFn: async () => (await supabase.from("obras").select("id, nome").order("nome")).data ?? [],
  });

  const { data: customRoles = [] } = useQuery({
    queryKey: ["custom-roles-admin"],
    enabled: isAdmin(roles),
    queryFn: async (): Promise<CustomRole[]> => {
      const { data } = await (supabase as any).from("custom_roles").select("id, name, label, description").order("label");
      return data ?? [];
    },
  });

  const { data: customRolePerms = [] } = useQuery({
    queryKey: ["custom-role-perms-admin"],
    enabled: isAdmin(roles),
    queryFn: async (): Promise<CustomRolePerm[]> => {
      const { data } = await (supabase as any)
        .from("custom_role_module_permissions")
        .select("custom_role_id, module, can_view, can_edit, can_delete");
      return data ?? [];
    },
  });


  const toggleObra = useMutation({
    mutationFn: async ({ user_id, obra_id, grant }: { user_id: string; obra_id: string; grant: boolean }) => {
      if (grant) {
        const { error } = await supabase.from("user_obras").insert({ user_id, obra_id });
        if (error && !String(error.message).includes("duplicate")) throw error;
      } else {
        const { error } = await supabase.from("user_obras").delete().eq("user_id", user_id).eq("obra_id", obra_id);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["all-users-perms"] }); qc.invalidateQueries({ queryKey: ["authorized-obras"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleRole = useMutation({
    mutationFn: async ({ user_id, role, grant }: { user_id: string; role: AppRole; grant: boolean }) => {
      const { error } = await supabase.rpc("admin_set_role", { _user_id: user_id, _role: role, _grant: grant });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Papel atualizado"); qc.invalidateQueries({ queryKey: ["all-users-perms"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const setPerm = useMutation({
    mutationFn: async (p: { user_id: string; module: AppModule; perm: ModulePerm }) => {
      const { error } = await supabase
        .from("user_module_permissions")
        .upsert({ user_id: p.user_id, module: p.module, ...p.perm }, { onConflict: "user_id,module" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["all-users-perms"] }),
    onError: (e: any) => toast.error(e.message),
  });

  const clearOverride = useMutation({
    mutationFn: async (p: { user_id: string; module: AppModule }) => {
      const { error } = await supabase.from("user_module_permissions").delete()
        .eq("user_id", p.user_id).eq("module", p.module);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Override removido"); qc.invalidateQueries({ queryKey: ["all-users-perms"] }); },
  });

  const toggleCustomRole = useMutation({
    mutationFn: async ({ user_id, custom_role_id, grant }: { user_id: string; custom_role_id: string; grant: boolean }) => {
      if (grant) {
        const { error } = await (supabase as any).from("user_custom_roles").insert({ user_id, custom_role_id });
        if (error && !String(error.message).includes("duplicate")) throw error;
      } else {
        const { error } = await (supabase as any).from("user_custom_roles").delete()
          .eq("user_id", user_id).eq("custom_role_id", custom_role_id);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["all-users-perms"] }); qc.invalidateQueries({ queryKey: ["my-custom-roles"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const createCustomRole = useMutation({
    mutationFn: async (p: { name: string; label: string; description?: string }) => {
      const { error } = await (supabase as any).from("custom_roles").insert(p);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Cargo criado"); qc.invalidateQueries({ queryKey: ["custom-roles-admin"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteCustomRole = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("custom_roles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Cargo removido"); qc.invalidateQueries({ queryKey: ["custom-roles-admin"] }); qc.invalidateQueries({ queryKey: ["all-users-perms"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const setCustomRolePerm = useMutation({
    mutationFn: async (p: { custom_role_id: string; module: AppModule; perm: ModulePerm }) => {
      const { error } = await (supabase as any)
        .from("custom_role_module_permissions")
        .upsert({ custom_role_id: p.custom_role_id, module: p.module, ...p.perm }, { onConflict: "custom_role_id,module" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["custom-role-perms-admin"] }),
    onError: (e: any) => toast.error(e.message),
  });


  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  if (!isAdmin(roles)) {
    return <Card className="p-8 text-center text-muted-foreground">Acesso restrito a administradores.</Card>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Acessos</h1>
        <p className="text-muted-foreground">
          Gerencie papéis e permissões finas por módulo (visualizar, editar, excluir) para cada usuário.
        </p>
      </div>

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">Usuários</TabsTrigger>
          <TabsTrigger value="custom-roles">Cargos hierárquicos</TabsTrigger>
          <TabsTrigger value="matrix">Matriz de papéis</TabsTrigger>
        </TabsList>


        <TabsContent value="users" className="space-y-3">
          {usuarios.map((u: any) => {
            const open = expanded[u.id];
            return (
              <Card key={u.id} className="p-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <button onClick={() => setExpanded({ ...expanded, [u.id]: !open })}
                    className="flex items-center gap-2 text-left">
                    {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    <div>
                      <p className="font-medium">{u.nome}</p>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                    </div>
                  </button>
                  <div className="flex gap-2 flex-wrap">
                    {ROLES.map((r) => {
                      const has = u.roles.includes(r);
                      return (
                        <Button key={r} size="sm" variant={has ? "default" : "outline"}
                          onClick={() => toggleRole.mutate({ user_id: u.id, role: r, grant: !has })}>
                          {r}
                        </Button>
                      );
                    })}
                  </div>
                </div>

                {open && (
                  <div className="mt-4 border-t pt-4 space-y-5">
                    <div>
                      <p className="text-sm font-medium mb-2">Obras autorizadas</p>
                      <p className="text-xs text-muted-foreground mb-2">
                        Admin e Gestor têm acesso a todas. Para os demais, selecione abaixo. Sem seleção: nenhuma obra fica visível.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {obrasAll.map((o: any) => {
                          const has = u.obras.includes(o.id);
                          return (
                            <Button key={o.id} size="sm" variant={has ? "default" : "outline"}
                              onClick={() => toggleObra.mutate({ user_id: u.id, obra_id: o.id, grant: !has })}>
                              {o.nome}
                            </Button>
                          );
                        })}
                        {obrasAll.length === 0 && <span className="text-xs text-muted-foreground">Nenhuma obra cadastrada.</span>}
                      </div>
                    </div>

                    <div>
                    <p className="text-sm font-medium mb-2">Permissões por módulo</p>
                    <p className="text-xs text-muted-foreground mb-3">
                      Valores em <em>itálico</em> vêm do papel padrão. Marque para sobrescrever para este usuário.
                    </p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-muted-foreground border-b">
                            <th className="py-2 pr-3">Módulo</th>
                            <th className="px-2">Visualizar</th>
                            <th className="px-2">Editar</th>
                            <th className="px-2">Excluir</th>
                            <th className="px-2">Origem</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {ALL_MODULES.map((m) => {
                            const override = u.perms.find((p: any) => p.module === m.key);
                            const eff = effectivePerm(m.key, u.roles, u.perms);
                            const update = (patch: Partial<ModulePerm>) => {
                              const next: ModulePerm = { ...eff, ...patch };
                              setPerm.mutate({ user_id: u.id, module: m.key, perm: next });
                            };
                            return (
                              <tr key={m.key} className="border-b">
                                <td className="py-2 pr-3 font-medium">{m.label}</td>
                                <td className="px-2"><Checkbox checked={eff.can_view} onCheckedChange={(v) => update({ can_view: !!v })} /></td>
                                <td className="px-2"><Checkbox checked={eff.can_edit} onCheckedChange={(v) => update({ can_edit: !!v })} /></td>
                                <td className="px-2"><Checkbox checked={eff.can_delete} onCheckedChange={(v) => update({ can_delete: !!v })} /></td>
                                <td className="px-2 text-xs">
                                  {override ? <span className="text-primary">override</span> : <em className="text-muted-foreground">padrão</em>}
                                </td>
                                <td className="px-2 text-right">
                                  {override && (
                                    <Button size="sm" variant="ghost"
                                      onClick={() => clearOverride.mutate({ user_id: u.id, module: m.key })}>
                                      Resetar
                                    </Button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
          {usuarios.length === 0 && <Card className="p-8 text-center text-muted-foreground">Nenhum usuário.</Card>}
        </TabsContent>

        <TabsContent value="matrix">
          <Card className="p-4 overflow-x-auto">
            <h3 className="font-medium mb-3">Permissões padrão por papel</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-3">Módulo</th>
                  {ROLES.map((r) => <th key={r} className="px-3 capitalize">{r}</th>)}
                </tr>
              </thead>
              <tbody>
                {ALL_MODULES.map((m) => (
                  <tr key={m.key} className="border-b">
                    <td className="py-2 pr-3 font-medium">{m.label}</td>
                    {ROLES.map((r) => {
                      const p = effectivePerm(m.key, [r], []);
                      const flags = [p.can_view && "V", p.can_edit && "E", p.can_delete && "X"].filter(Boolean).join(" / ");
                      return <td key={r} className="px-3 text-xs">{flags || <span className="text-muted-foreground">—</span>}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-muted-foreground mt-3">V = visualizar · E = editar · X = excluir</p>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
