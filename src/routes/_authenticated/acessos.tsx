import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  isAdmin, useUserRoles, ALL_MODULES, effectivePerm,
  type AppRole, type AppModule, type ModulePerm, type CustomRole, type CustomRolePerm, type SystemRolePerm,
} from "@/lib/permissions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, ChevronRight, Plus, Trash2, Pencil, Save, X } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/acessos")({ component: AcessosPage });

const SYSTEM_ROLES: { key: AppRole; label: string; description: string }[] = [
  { key: "admin", label: "Administrador", description: "Acesso total. Gerencia cargos e usuários." },
  { key: "gestor", label: "Gestor", description: "Acesso a todas as obras. Edita quase tudo, não exclui." },
  { key: "financeiro", label: "Financeiro", description: "Edita o módulo financeiro, visualiza os demais." },
  { key: "colaborador", label: "Colaborador", description: "Visualiza apenas Dashboard, Tarefas, Funcionários e EPIs." },
];
const TEMPLATES: AppRole[] = ["gestor", "financeiro", "colaborador"];

// Unified cargo identifier — system roles prefixed to distinguish from UUID custom roles
type CargoRef = { kind: "system"; key: AppRole } | { kind: "custom"; id: string };
const cargoId = (c: CargoRef) => (c.kind === "system" ? `sys:${c.key}` : `cus:${c.id}`);
const parseCargoId = (s: string): CargoRef =>
  s.startsWith("sys:") ? { kind: "system", key: s.slice(4) as AppRole } : { kind: "custom", id: s.slice(4) };

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
      const { data } = await (supabase as any)
        .from("custom_roles")
        .select("id, name, label, description, parent_role_id, template_role")
        .order("label");
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

  const { data: systemRolePerms = [] } = useQuery({
    queryKey: ["system-role-perms-admin"],
    enabled: isAdmin(roles),
    queryFn: async (): Promise<SystemRolePerm[]> => {
      const { data } = await (supabase as any)
        .from("system_role_module_permissions")
        .select("role, module, can_view, can_edit, can_delete");
      return data ?? [];
    },
  });

  const { data: auditLog = [] } = useQuery({
    queryKey: ["permission-audit-log"],
    enabled: isAdmin(roles),
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("permission_audit_log")
        .select("id, created_at, actor_email, action, target_user_id, custom_role_id, module, details")
        .order("created_at", { ascending: false })
        .limit(200);
      return data ?? [];
    },
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["all-users-perms"] });
    qc.invalidateQueries({ queryKey: ["custom-roles-admin"] });
    qc.invalidateQueries({ queryKey: ["custom-role-perms-admin"] });
    qc.invalidateQueries({ queryKey: ["system-role-perms-admin"] });
    qc.invalidateQueries({ queryKey: ["all-system-role-perms"] });
    qc.invalidateQueries({ queryKey: ["permission-audit-log"] });
    qc.invalidateQueries({ queryKey: ["my-custom-roles"] });
    qc.invalidateQueries({ queryKey: ["all-custom-role-perms"] });
    qc.invalidateQueries({ queryKey: ["my-module-perms"] });
    qc.invalidateQueries({ queryKey: ["userRoles"] });
    qc.invalidateQueries({ queryKey: ["authorized-obras"] });
  };

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
    onSuccess: invalidateAll,
    onError: (e: any) => toast.error(e.message),
  });

  // Unified cargo toggle — handles both system roles and custom roles
  const toggleCargo = useMutation({
    mutationFn: async ({ user_id, cargo, grant }: { user_id: string; cargo: CargoRef; grant: boolean }) => {
      if (cargo.kind === "system") {
        const { error } = await supabase.rpc("admin_set_role", { _user_id: user_id, _role: cargo.key, _grant: grant });
        if (error) throw error;
      } else {
        if (grant) {
          const { error } = await (supabase as any).from("user_custom_roles").insert({ user_id, custom_role_id: cargo.id });
          if (error && !String(error.message).includes("duplicate")) throw error;
        } else {
          const { error } = await (supabase as any).from("user_custom_roles").delete()
            .eq("user_id", user_id).eq("custom_role_id", cargo.id);
          if (error) throw error;
        }
      }
    },
    onSuccess: () => { toast.success("Cargo atualizado"); invalidateAll(); },
    onError: (e: any) => toast.error(e.message),
  });

  const setPerm = useMutation({
    mutationFn: async (p: { user_id: string; module: AppModule; perm: ModulePerm }) => {
      const { error } = await supabase
        .from("user_module_permissions")
        .upsert({ user_id: p.user_id, module: p.module, ...p.perm }, { onConflict: "user_id,module" });
      if (error) throw error;
    },
    onSuccess: invalidateAll,
    onError: (e: any) => toast.error(e.message),
  });

  const clearOverride = useMutation({
    mutationFn: async (p: { user_id: string; module: AppModule }) => {
      const { error } = await supabase.from("user_module_permissions").delete()
        .eq("user_id", p.user_id).eq("module", p.module);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Override removido"); invalidateAll(); },
  });

  const deleteUser = useMutation({
    mutationFn: async (user_id: string) => {
      const { error } = await supabase.rpc("admin_delete_user", { _user_id: user_id });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Usuário excluído"); invalidateAll(); },
    onError: (e: any) => toast.error(e.message),
  });

  // Bulk — supports system role or custom cargo
  const bulkAssign = useMutation({
    mutationFn: async (p: { user_ids: string[]; cargo: CargoRef; grant: boolean }) => {
      if (p.cargo.kind === "system") {
        for (const uid of p.user_ids) {
          const { error } = await supabase.rpc("admin_set_role", { _user_id: uid, _role: p.cargo.key, _grant: p.grant });
          if (error) throw error;
        }
      } else {
        const { error } = await (supabase as any).rpc("admin_bulk_set_custom_role", {
          _user_ids: p.user_ids, _custom_role_id: p.cargo.id, _grant: p.grant,
        });
        if (error) throw error;
      }
    },
    onSuccess: (_d, v) => { toast.success(`${v.user_ids.length} usuário(s) atualizados`); invalidateAll(); },
    onError: (e: any) => toast.error(e.message),
  });

  const createFromTemplate = useMutation({
    mutationFn: async (p: { name: string; label: string; description?: string; template: AppRole }) => {
      const { error } = await (supabase as any).rpc("admin_create_custom_role_from_template", {
        _name: p.name, _label: p.label, _description: p.description ?? null, _template: p.template,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Cargo criado a partir de template"); invalidateAll(); },
    onError: (e: any) => toast.error(e.message),
  });

  const createInherit = useMutation({
    mutationFn: async (p: { name: string; label: string; description?: string; parent_id: string }) => {
      const { error } = await (supabase as any).rpc("admin_create_custom_role_inherit", {
        _name: p.name, _label: p.label, _description: p.description ?? null, _parent_id: p.parent_id,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Cargo criado herdando permissões"); invalidateAll(); },
    onError: (e: any) => toast.error(e.message),
  });

  const updateCustomRole = useMutation({
    mutationFn: async (p: { id: string; name: string; label: string; description: string }) => {
      const { error } = await (supabase as any).rpc("admin_update_custom_role", {
        _id: p.id, _name: p.name, _label: p.label, _description: p.description,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Cargo atualizado"); invalidateAll(); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteCustomRole = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("custom_roles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Cargo removido"); invalidateAll(); },
    onError: (e: any) => toast.error(e.message),
  });

  const setCustomRolePerm = useMutation({
    mutationFn: async (p: { custom_role_id: string; module: AppModule; perm: ModulePerm }) => {
      const { error } = await (supabase as any)
        .from("custom_role_module_permissions")
        .upsert({ custom_role_id: p.custom_role_id, module: p.module, ...p.perm }, { onConflict: "custom_role_id,module" });
      if (error) throw error;
    },
    onSuccess: invalidateAll,
    onError: (e: any) => toast.error(e.message),
  });

  const setSystemRolePerm = useMutation({
    mutationFn: async (p: { role: AppRole; module: AppModule; perm: ModulePerm }) => {
      const { error } = await (supabase as any).rpc("admin_set_system_role_perm", {
        _role: p.role, _module: p.module,
        _can_view: p.perm.can_view, _can_edit: p.perm.can_edit, _can_delete: p.perm.can_delete,
      });
      if (error) throw error;
    },
    onSuccess: invalidateAll,
    onError: (e: any) => toast.error(e.message),
  });

  const updateSystemRoleLabel = useMutation({
    mutationFn: async (p: { role: AppRole; label: string; description: string }) => {
      const { error } = await (supabase as any).rpc("admin_set_system_role_label", {
        _role: p.role, _label: p.label, _description: p.description,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Cargo do sistema atualizado"); invalidateAll(); },
    onError: (e: any) => toast.error(e.message),
  });

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  if (!isAdmin(roles)) {
    return <Card className="p-8 text-center text-muted-foreground">Acesso restrito a administradores.</Card>;
  }

  // Unified cargo list shown everywhere (system roles first, then custom)
  const allCargos: { ref: CargoRef; label: string; system: boolean }[] = [
    ...SYSTEM_ROLES.map((s) => ({ ref: { kind: "system" as const, key: s.key }, label: s.label, system: true })),
    ...customRoles.map((c) => ({ ref: { kind: "custom" as const, id: c.id }, label: c.label, system: false })),
  ];

  const userHasCargo = (u: any, ref: CargoRef) =>
    ref.kind === "system" ? u.roles.includes(ref.key) : u.customRoleIds.includes(ref.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Acessos</h1>
        <p className="text-muted-foreground">
          Cargos, permissões por módulo, obras autorizadas e histórico de alterações.
        </p>
      </div>

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">Usuários</TabsTrigger>
          <TabsTrigger value="cargos">Cargos</TabsTrigger>
          <TabsTrigger value="bulk">Atribuição em massa</TabsTrigger>
          <TabsTrigger value="audit">Histórico</TabsTrigger>
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
                  <div className="flex gap-1 flex-wrap justify-end">
                    {allCargos.map((c) => {
                      const has = userHasCargo(u, c.ref);
                      return (
                        <Button
                          key={cargoId(c.ref)}
                          size="sm"
                          variant={has ? "default" : "outline"}
                          onClick={() => toggleCargo.mutate({ user_id: u.id, cargo: c.ref, grant: !has })}
                          title={c.system ? "Cargo do sistema" : "Cargo personalizado"}
                        >
                          {c.label}{c.system && <span className="ml-1 text-[10px] opacity-60">•sis</span>}
                        </Button>
                      );
                    })}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => {
                        if (confirm(`Excluir o usuário "${u.nome}"? Esta ação remove perfil, cargos e permissões. A conta de autenticação deve ser removida pelo painel.`)) {
                          deleteUser.mutate(u.id);
                        }
                      }}
                      title="Excluir usuário"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {open && (
                  <div className="mt-4 border-t pt-4 space-y-5">
                    <div>
                      <p className="text-sm font-medium mb-2">Obras autorizadas</p>
                      <p className="text-xs text-muted-foreground mb-2">
                        Administrador e Gestor têm acesso a todas. Para os demais, selecione abaixo.
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
                      Prioridade: <b>override individual</b> &gt; cargo personalizado &gt; cargo do sistema.
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
                            const eff = effectivePerm(m.key, u.roles, u.perms, u.customRoleIds, customRolePerms, systemRolePerms);
                            const update = (patch: Partial<ModulePerm>) => {
                              const next: ModulePerm = { ...eff, ...patch };
                              setPerm.mutate({ user_id: u.id, module: m.key, perm: next });
                            };
                            const fromCustom = !override && u.customRoleIds.some((id: string) =>
                              customRolePerms.some((p) => p.custom_role_id === id && p.module === m.key));
                            return (
                              <tr key={m.key} className="border-b">
                                <td className="py-2 pr-3 font-medium">{m.label}</td>
                                <td className="px-2"><Checkbox checked={eff.can_view} onCheckedChange={(v) => update({ can_view: !!v })} /></td>
                                <td className="px-2"><Checkbox checked={eff.can_edit} onCheckedChange={(v) => update({ can_edit: !!v })} /></td>
                                <td className="px-2"><Checkbox checked={eff.can_delete} onCheckedChange={(v) => update({ can_delete: !!v })} /></td>
                                <td className="px-2 text-xs">
                                  {override ? <span className="text-primary">override</span>
                                    : fromCustom ? <span className="text-foreground">cargo</span>
                                    : <em className="text-muted-foreground">sistema</em>}
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

        <TabsContent value="cargos" className="space-y-4">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
              <div>
                <h3 className="font-medium">Cargos</h3>
                <p className="text-xs text-muted-foreground">
                  Edite rótulo, descrição e permissões dos cargos do sistema, ou crie cargos personalizados a partir de um <b>template</b> ou <b>herde</b> de outro.
                </p>
              </div>
              <CreateCustomRoleDialog
                customRoles={customRoles}
                onTemplate={(p) => createFromTemplate.mutate(p)}
                onInherit={(p) => createInherit.mutate(p)}
              />
            </div>

            <div className="space-y-4">
              {SYSTEM_ROLES.map((s) => (
                <SystemRoleCard key={s.key} role={s} />
              ))}
              {customRoles.map((cr) => (
                <CustomRoleCard
                  key={cr.id}
                  role={cr}
                  customRoles={customRoles}
                  perms={customRolePerms.filter((p) => p.custom_role_id === cr.id)}
                  onUpdate={(p) => updateCustomRole.mutate(p)}
                  onDelete={() => deleteCustomRole.mutate(cr.id)}
                  onSetPerm={(perm) => setCustomRolePerm.mutate(perm)}
                />
              ))}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="bulk">
          <BulkAssignPanel
            usuarios={usuarios}
            allCargos={allCargos}
            onBulk={(p) => bulkAssign.mutate(p)}
          />
        </TabsContent>

        <TabsContent value="audit">
          <AuditPanel rows={auditLog} usuarios={usuarios} customRoles={customRoles} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SystemRoleCard({ role }: { role: { key: AppRole; label: string; description: string } }) {
  return (
    <Card className="p-4 bg-muted/30">
      <div className="flex items-start justify-between mb-3 gap-2 flex-wrap">
        <div>
          <p className="font-medium">{role.label} <span className="text-xs text-muted-foreground">(sistema · {role.key})</span></p>
          <p className="text-xs text-muted-foreground">{role.description}</p>
        </div>
        <span className="text-[10px] uppercase tracking-wider bg-secondary text-secondary-foreground px-2 py-1 rounded">Não editável</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground border-b">
              <th className="py-2 pr-3">Módulo</th>
              <th className="px-2">Visualizar</th>
              <th className="px-2">Editar</th>
              <th className="px-2">Excluir</th>
            </tr>
          </thead>
          <tbody>
            {ALL_MODULES.map((m) => {
              const p = effectivePerm(m.key, [role.key], []);
              return (
                <tr key={m.key} className="border-b">
                  <td className="py-2 pr-3 font-medium">{m.label}</td>
                  <td className="px-2"><Checkbox checked={p.can_view} disabled /></td>
                  <td className="px-2"><Checkbox checked={p.can_edit} disabled /></td>
                  <td className="px-2"><Checkbox checked={p.can_delete} disabled /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function CustomRoleCard({ role, customRoles, perms, onUpdate, onDelete, onSetPerm }: {
  role: CustomRole;
  customRoles: CustomRole[];
  perms: CustomRolePerm[];
  onUpdate: (p: { id: string; name: string; label: string; description: string }) => void;
  onDelete: () => void;
  onSetPerm: (p: { custom_role_id: string; module: AppModule; perm: ModulePerm }) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(role.label);
  const [name, setName] = useState(role.name);
  const [description, setDescription] = useState(role.description ?? "");
  const parent = customRoles.find((c) => c.id === role.parent_role_id);

  const save = () => {
    onUpdate({ id: role.id, name: name.trim(), label: label.trim(), description });
    setEditing(false);
  };

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between mb-3 gap-2 flex-wrap">
        {editing ? (
          <div className="flex-1 space-y-2">
            <div className="flex gap-2 flex-wrap">
              <div className="flex-1 min-w-[180px]">
                <Label className="text-xs">Rótulo</Label>
                <Input value={label} onChange={(e) => setLabel(e.target.value)} />
              </div>
              <div className="flex-1 min-w-[180px]">
                <Label className="text-xs">Nome interno</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Descrição</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
          </div>
        ) : (
          <div>
            <p className="font-medium">{role.label} <span className="text-xs text-muted-foreground">({role.name})</span></p>
            {role.description && <p className="text-xs text-muted-foreground">{role.description}</p>}
            <p className="text-xs text-muted-foreground mt-1">
              {role.template_role && <>Template: <b>{role.template_role}</b>. </>}
              {parent && <>Herda de: <b>{parent.label}</b>.</>}
            </p>
          </div>
        )}
        <div className="flex gap-1">
          {editing ? (
            <>
              <Button size="sm" variant="default" onClick={save}><Save className="h-4 w-4" /></Button>
              <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setLabel(role.label); setName(role.name); setDescription(role.description ?? ""); }}>
                <X className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="ghost" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /></Button>
              <Button size="sm" variant="ghost" onClick={() => { if (confirm(`Remover cargo "${role.label}"?`)) onDelete(); }}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground border-b">
              <th className="py-2 pr-3">Módulo</th>
              <th className="px-2">Visualizar</th>
              <th className="px-2">Editar</th>
              <th className="px-2">Excluir</th>
            </tr>
          </thead>
          <tbody>
            {ALL_MODULES.map((m) => {
              const p = perms.find((x) => x.module === m.key);
              const cur: ModulePerm = p ?? { can_view: false, can_edit: false, can_delete: false };
              const update = (patch: Partial<ModulePerm>) =>
                onSetPerm({ custom_role_id: role.id, module: m.key, perm: { ...cur, ...patch } });
              return (
                <tr key={m.key} className="border-b">
                  <td className="py-2 pr-3 font-medium">{m.label}</td>
                  <td className="px-2"><Checkbox checked={cur.can_view} onCheckedChange={(v) => update({ can_view: !!v })} /></td>
                  <td className="px-2"><Checkbox checked={cur.can_edit} onCheckedChange={(v) => update({ can_edit: !!v })} /></td>
                  <td className="px-2"><Checkbox checked={cur.can_delete} onCheckedChange={(v) => update({ can_delete: !!v })} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function CreateCustomRoleDialog({ customRoles, onTemplate, onInherit }: {
  customRoles: CustomRole[];
  onTemplate: (p: { name: string; label: string; description?: string; template: AppRole }) => void;
  onInherit: (p: { name: string; label: string; description?: string; parent_id: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"template" | "inherit">("template");
  const [name, setName] = useState("");
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [template, setTemplate] = useState<AppRole>("colaborador");
  const [parentId, setParentId] = useState<string>("");

  const reset = () => { setName(""); setLabel(""); setDescription(""); setTemplate("colaborador"); setParentId(""); setMode("template"); };

  const submit = () => {
    const cleanName = name.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
    if (!cleanName || !label.trim()) { toast.error("Preencha rótulo e nome interno"); return; }
    if (mode === "template") {
      onTemplate({ name: cleanName, label: label.trim(), description: description.trim() || undefined, template });
    } else {
      if (!parentId) { toast.error("Selecione o cargo pai"); return; }
      onInherit({ name: cleanName, label: label.trim(), description: description.trim() || undefined, parent_id: parentId });
    }
    setOpen(false); reset();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="h-4 w-4" /> Novo cargo</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Criar cargo personalizado</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-2">
            <Button size="sm" variant={mode === "template" ? "default" : "outline"} onClick={() => setMode("template")}>A partir de cargo do sistema</Button>
            <Button size="sm" variant={mode === "inherit" ? "default" : "outline"} onClick={() => setMode("inherit")} disabled={customRoles.length === 0}>
              Herdar de cargo existente
            </Button>
          </div>
          <div>
            <Label>Rótulo (exibido)</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex.: Supervisor de Obra" />
          </div>
          <div>
            <Label>Nome interno (sem espaços)</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex.: supervisor_obra" />
          </div>
          <div>
            <Label>Descrição (opcional)</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          {mode === "template" ? (
            <div>
              <Label>Base</Label>
              <Select value={template} onValueChange={(v) => setTemplate(v as AppRole)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TEMPLATES.map((r) => <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">As permissões do cargo do sistema são copiadas. Depois ajuste apenas o que mudar.</p>
            </div>
          ) : (
            <div>
              <Label>Cargo pai</Label>
              <Select value={parentId} onValueChange={setParentId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {customRoles.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">As permissões do cargo pai são copiadas. Mudanças só afetam o novo cargo.</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={submit}>Criar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BulkAssignPanel({ usuarios, allCargos, onBulk }: {
  usuarios: any[];
  allCargos: { ref: CargoRef; label: string; system: boolean }[];
  onBulk: (p: { user_ids: string[]; cargo: CargoRef; grant: boolean }) => void;
}) {
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [cargoKey, setCargoKey] = useState<string>("");
  const [filter, setFilter] = useState("");

  const filtered = useMemo(() =>
    usuarios.filter((u) =>
      !filter ||
      u.nome?.toLowerCase().includes(filter.toLowerCase()) ||
      u.email?.toLowerCase().includes(filter.toLowerCase())
    ), [usuarios, filter]);

  const selectedIds = Object.entries(selected).filter(([, v]) => v).map(([k]) => k);
  const allChecked = filtered.length > 0 && filtered.every((u) => selected[u.id]);
  const toggleAll = () => {
    const next = { ...selected };
    if (allChecked) filtered.forEach((u) => delete next[u.id]);
    else filtered.forEach((u) => (next[u.id] = true));
    setSelected(next);
  };

  const act = (grant: boolean) => {
    if (!cargoKey) { toast.error("Selecione um cargo"); return; }
    if (selectedIds.length === 0) { toast.error("Selecione ao menos um usuário"); return; }
    onBulk({ user_ids: selectedIds, cargo: parseCargoId(cargoKey), grant });
    setSelected({});
  };

  return (
    <Card className="p-4 space-y-4">
      <div>
        <h3 className="font-medium">Atribuição em massa</h3>
        <p className="text-xs text-muted-foreground">
          Marque os usuários, escolha o cargo e atribua ou remova para todos de uma vez.
          As obras autorizadas de cada usuário não são alteradas.
        </p>
      </div>
      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex-1 min-w-[200px]">
          <Label>Buscar usuário</Label>
          <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Nome ou e-mail" />
        </div>
        <div className="min-w-[240px]">
          <Label>Cargo</Label>
          <Select value={cargoKey} onValueChange={setCargoKey}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              {allCargos.map((c) => (
                <SelectItem key={cargoId(c.ref)} value={cargoId(c.ref)}>
                  {c.label}{c.system ? " (sistema)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => act(true)}>Atribuir a {selectedIds.length}</Button>
        <Button variant="outline" onClick={() => act(false)}>Remover de {selectedIds.length}</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-2 px-2"><Checkbox checked={allChecked} onCheckedChange={toggleAll} /></th>
              <th className="py-2 pr-3">Usuário</th>
              <th className="py-2 pr-3">E-mail</th>
              <th className="py-2 pr-3">Cargos do sistema</th>
              <th className="py-2 pr-3">Cargos personalizados</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => {
              const sys = u.roles.join(", ") || "—";
              const cus = allCargos.filter((c) => !c.system && u.customRoleIds.includes((c.ref as any).id)).map((c) => c.label).join(", ") || "—";
              return (
                <tr key={u.id} className="border-b">
                  <td className="px-2"><Checkbox checked={!!selected[u.id]} onCheckedChange={(v) => setSelected({ ...selected, [u.id]: !!v })} /></td>
                  <td className="py-2 pr-3">{u.nome}</td>
                  <td className="py-2 pr-3 text-xs text-muted-foreground">{u.email}</td>
                  <td className="py-2 pr-3 text-xs">{sys}</td>
                  <td className="py-2 pr-3 text-xs">{cus}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function AuditPanel({ rows, usuarios, customRoles }: { rows: any[]; usuarios: any[]; customRoles: CustomRole[] }) {
  const userMap = useMemo(() => Object.fromEntries(usuarios.map((u) => [u.id, u])), [usuarios]);
  const roleMap = useMemo(() => Object.fromEntries(customRoles.map((c) => [c.id, c])), [customRoles]);

  const describe = (r: any) => {
    const target = r.target_user_id ? (userMap[r.target_user_id]?.nome ?? r.target_user_id.slice(0, 8)) : null;
    const cargo = r.custom_role_id ? (roleMap[r.custom_role_id]?.label ?? r.details?.label ?? "cargo") : null;
    const d = r.details ?? {};
    switch (r.action) {
      case "role_grant": return `Atribuiu cargo do sistema "${d.role}" para ${target}`;
      case "role_revoke": return `Removeu cargo do sistema "${d.role}" de ${target}`;
      case "custom_role_assign": return `Atribuiu cargo "${cargo}" para ${target}`;
      case "custom_role_unassign": return `Removeu cargo "${cargo}" de ${target}`;
      case "override_set": return `Override em "${r.module}" para ${target} (V:${d.can_view?"✓":"✗"} E:${d.can_edit?"✓":"✗"} X:${d.can_delete?"✓":"✗"})`;
      case "override_clear": return `Removeu override de "${r.module}" para ${target}`;
      case "custom_role_perm_set": return `Cargo "${cargo}" módulo "${r.module}" (V:${d.can_view?"✓":"✗"} E:${d.can_edit?"✓":"✗"} X:${d.can_delete?"✓":"✗"})`;
      case "custom_role_created": return `Criou cargo "${d.label}"`;
      case "custom_role_deleted": return `Excluiu cargo "${d.label}"`;
      case "custom_role_updated": return `Atualizou cargo "${d.label}"`;
      default: return r.action;
    }
  };

  return (
    <Card className="p-4">
      <h3 className="font-medium mb-3">Histórico de alterações (últimas 200)</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-2 pr-3">Data</th>
              <th className="py-2 pr-3">Autor</th>
              <th className="py-2 pr-3">Ação</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b">
                <td className="py-2 pr-3 text-xs text-muted-foreground whitespace-nowrap">
                  {format(new Date(r.created_at), "dd/MM/yyyy HH:mm")}
                </td>
                <td className="py-2 pr-3 text-xs">{r.actor_email ?? "—"}</td>
                <td className="py-2 pr-3 text-xs">{describe(r)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={3} className="py-6 text-center text-muted-foreground text-sm">Nenhum evento registrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
