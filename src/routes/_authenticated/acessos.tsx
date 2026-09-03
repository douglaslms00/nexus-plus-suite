import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  isAdmin,
  useUserRoles,
  ALL_MODULES,
  effectivePerm,
  type AppRole,
  type AppModule,
  type ModulePerm,
  type CustomRole,
  type CustomRolePerm,
  type SystemRolePerm,
} from "@/lib/permissions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  Pencil,
  Save,
  X,
  Search,
  Shield,
  ShieldAlert,
  Sparkles,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/acessos")({ component: AcessosPage });

const SYSTEM_ROLES: { key: AppRole; label: string; description: string }[] = [
  {
    key: "admin",
    label: "Administrador",
    description: "Acesso total. Gerencia cargos e usuários.",
  },
  {
    key: "gestor",
    label: "Gestor",
    description: "Acesso a todas as obras. Edita quase tudo, não exclui.",
  },
  {
    key: "financeiro",
    label: "Financeiro",
    description: "Edita o módulo financeiro, visualiza os demais.",
  },
  {
    key: "colaborador",
    label: "Colaborador",
    description: "Visualiza apenas Dashboard, Tarefas, Funcionários e EPIs.",
  },
];
const TEMPLATES: AppRole[] = ["gestor", "financeiro", "colaborador"];

// Unified cargo identifier — system roles prefixed to distinguish from UUID custom roles
export type CargoRef = { kind: "system"; key: AppRole } | { kind: "custom"; id: string };
export const cargoId = (c: CargoRef) => (c.kind === "system" ? `sys:${c.key}` : `cus:${c.id}`);
export const parseCargoId = (s: string): CargoRef =>
  s.startsWith("sys:")
    ? { kind: "system", key: s.slice(4) as AppRole }
    : { kind: "custom", id: s.slice(4) };

export type UnifiedCargo = {
  id: string;
  ref: CargoRef;
  label: string;
  name: string;
  description: string;
  isSystem: boolean;
  systemKey?: AppRole;
  customRoleId?: string;
  templateRole?: AppRole | null;
  parentLabel?: string | null;
};

function AcessosPage() {
  const qc = useQueryClient();
  const { data: roles } = useUserRoles();

  const { data: usuarios = [] } = useQuery({
    queryKey: ["all-users-perms"],
    enabled: isAdmin(roles),
    staleTime: 1000 * 60 * 2,
    queryFn: async () => {
      const [
        { data: profs },
        { data: r },
        { data: perms },
        { data: uobras },
        { data: ucroles },
        { data: emails },
      ] = await Promise.all([
        (supabase as any).rpc("list_profile_directory"),
        supabase.from("user_roles").select("user_id, role"),
        supabase
          .from("user_module_permissions")
          .select("user_id, module, can_view, can_edit, can_delete"),
        supabase.from("user_obras").select("user_id, obra_id"),
        (supabase as any).from("user_custom_roles").select("user_id, custom_role_id"),
        (supabase as any).rpc("admin_list_profile_emails"),
      ]);
      return (profs ?? []).map((p: any) => ({
        ...p,
        email: (emails ?? []).find((e: any) => e.id === p.id)?.email ?? null,

        roles: (r ?? [])
          .filter((x: any) => x.user_id === p.id)
          .map((x: any) => x.role) as AppRole[],
        perms: (perms ?? []).filter((x: any) => x.user_id === p.id) as ({
          module: AppModule;
        } & ModulePerm)[],
        obras: (uobras ?? [])
          .filter((x: any) => x.user_id === p.id)
          .map((x: any) => x.obra_id) as string[],
        customRoleIds: (ucroles ?? [])
          .filter((x: any) => x.user_id === p.id)
          .map((x: any) => x.custom_role_id) as string[],
      }));
    },
  });

  const { data: obrasAll = [] } = useQuery({
    queryKey: ["obras-all-admin"],
    enabled: isAdmin(roles),
    staleTime: 1000 * 60 * 5,
    queryFn: async () => (await supabase.from("obras").select("id, nome").order("nome")).data ?? [],
  });

  const { data: customRoles = [] } = useQuery({
    queryKey: ["custom-roles-admin"],
    enabled: isAdmin(roles),
    staleTime: 1000 * 60 * 2,
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
    staleTime: 1000 * 60 * 2,
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
    staleTime: 1000 * 60 * 2,
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
    staleTime: 1000 * 30,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("permission_audit_log")
        .select(
          "id, created_at, actor_email, action, target_user_id, custom_role_id, module, details",
        )
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
    mutationFn: async ({
      user_id,
      obra_id,
      grant,
    }: {
      user_id: string;
      obra_id: string;
      grant: boolean;
    }) => {
      if (grant) {
        const { error } = await supabase.from("user_obras").insert({ user_id, obra_id });
        if (error && !String(error.message).includes("duplicate")) throw error;
      } else {
        const { error } = await supabase
          .from("user_obras")
          .delete()
          .eq("user_id", user_id)
          .eq("obra_id", obra_id);
        if (error) throw error;
      }
    },
    onSuccess: invalidateAll,
    onError: (e: any) => toast.error(e.message),
  });

  // Unified cargo toggle — handles both system roles and custom roles
  const toggleCargo = useMutation({
    mutationFn: async ({
      user_id,
      cargo,
      grant,
    }: {
      user_id: string;
      cargo: CargoRef;
      grant: boolean;
    }) => {
      if (cargo.kind === "system") {
        const { error } = await supabase.rpc("admin_set_role", {
          _user_id: user_id,
          _role: cargo.key,
          _grant: grant,
        });
        if (error) throw error;
      } else {
        if (grant) {
          const { error } = await (supabase as any)
            .from("user_custom_roles")
            .insert({ user_id, custom_role_id: cargo.id });
          if (error && !String(error.message).includes("duplicate")) throw error;
        } else {
          const { error } = await (supabase as any)
            .from("user_custom_roles")
            .delete()
            .eq("user_id", user_id)
            .eq("custom_role_id", cargo.id);
          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      toast.success("Cargo atualizado");
      invalidateAll();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const setPerm = useMutation({
    mutationFn: async (p: { user_id: string; module: AppModule; perm: ModulePerm }) => {
      const { error } = await supabase
        .from("user_module_permissions")
        .upsert(
          { user_id: p.user_id, module: p.module, ...p.perm },
          { onConflict: "user_id,module" },
        );
      if (error) throw error;
    },
    onSuccess: invalidateAll,
    onError: (e: any) => toast.error(e.message),
  });

  const clearOverride = useMutation({
    mutationFn: async (p: { user_id: string; module: AppModule }) => {
      const { error } = await supabase
        .from("user_module_permissions")
        .delete()
        .eq("user_id", p.user_id)
        .eq("module", p.module);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Override removido");
      invalidateAll();
    },
  });

  const deleteUser = useMutation({
    mutationFn: async (user_id: string) => {
      const { error } = await supabase.rpc("admin_delete_user", { _user_id: user_id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Usuário excluído");
      invalidateAll();
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Bulk — supports system role or custom cargo
  const bulkAssign = useMutation({
    mutationFn: async (p: { user_ids: string[]; cargo: CargoRef; grant: boolean }) => {
      if (p.cargo.kind === "system") {
        for (const uid of p.user_ids) {
          const { error } = await supabase.rpc("admin_set_role", {
            _user_id: uid,
            _role: p.cargo.key,
            _grant: p.grant,
          });
          if (error) throw error;
        }
      } else {
        const { error } = await (supabase as any).rpc("admin_bulk_set_custom_role", {
          _user_ids: p.user_ids,
          _custom_role_id: p.cargo.id,
          _grant: p.grant,
        });
        if (error) throw error;
      }
    },
    onSuccess: (_d, v) => {
      toast.success(`${v.user_ids.length} usuário(s) atualizados`);
      invalidateAll();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const createFromTemplate = useMutation({
    mutationFn: async (p: {
      name: string;
      label: string;
      description?: string;
      template: AppRole;
    }) => {
      const { error } = await (supabase as any).rpc("admin_create_custom_role_from_template", {
        _name: p.name,
        _label: p.label,
        _description: p.description ?? null,
        _template: p.template,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cargo criado a partir de template");
      invalidateAll();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const createInherit = useMutation({
    mutationFn: async (p: {
      name: string;
      label: string;
      description?: string;
      parent_id: string;
    }) => {
      const { error } = await (supabase as any).rpc("admin_create_custom_role_inherit", {
        _name: p.name,
        _label: p.label,
        _description: p.description ?? null,
        _parent_id: p.parent_id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cargo criado herdando permissões");
      invalidateAll();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateCustomRole = useMutation({
    mutationFn: async (p: { id: string; name: string; label: string; description: string }) => {
      const { error } = await (supabase as any).rpc("admin_update_custom_role", {
        _id: p.id,
        _name: p.name,
        _label: p.label,
        _description: p.description,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cargo atualizado");
      invalidateAll();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteCustomRole = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("custom_roles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cargo removido");
      invalidateAll();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const setCustomRolePerm = useMutation({
    mutationFn: async (p: { custom_role_id: string; module: AppModule; perm: ModulePerm }) => {
      const { error } = await (supabase as any)
        .from("custom_role_module_permissions")
        .upsert(
          { custom_role_id: p.custom_role_id, module: p.module, ...p.perm },
          { onConflict: "custom_role_id,module" },
        );
      if (error) throw error;
    },
    onSuccess: invalidateAll,
    onError: (e: any) => toast.error(e.message),
  });

  const setSystemRolePerm = useMutation({
    mutationFn: async (p: { role: AppRole; module: AppModule; perm: ModulePerm }) => {
      const { error } = await (supabase as any).rpc("admin_set_system_role_perm", {
        _role: p.role,
        _module: p.module,
        _can_view: p.perm.can_view,
        _can_edit: p.perm.can_edit,
        _can_delete: p.perm.can_delete,
      });
      if (error) throw error;
    },
    onSuccess: invalidateAll,
    onError: (e: any) => toast.error(e.message),
  });

  const updateSystemRoleLabel = useMutation({
    mutationFn: async (p: { role: AppRole; label: string; description: string }) => {
      const { error } = await (supabase as any).rpc("admin_set_system_role_label", {
        _role: p.role,
        _label: p.label,
        _description: p.description,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cargo do sistema atualizado");
      invalidateAll();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [cargoSearch, setCargoSearch] = useState("");
  const [cargoFilter, setCargoFilter] = useState<"all" | "system" | "custom">("all");

  if (!isAdmin(roles)) {
    return (
      <Card className="p-8 text-center text-muted-foreground">
        Acesso restrito a administradores.
      </Card>
    );
  }

  // Unified cargo list shown everywhere
  const allCargos: { ref: CargoRef; label: string; system: boolean }[] = [
    ...SYSTEM_ROLES.map((s) => ({
      ref: { kind: "system" as const, key: s.key },
      label: s.label,
      system: true,
    })),
    ...customRoles.map((c) => ({
      ref: { kind: "custom" as const, id: c.id },
      label: c.label,
      system: false,
    })),
  ];

  // Full unified cargo items for the Cargos management tab
  const unifiedCargos: UnifiedCargo[] = [
    ...SYSTEM_ROLES.map((s) => ({
      id: `sys:${s.key}`,
      ref: { kind: "system" as const, key: s.key },
      label: s.label,
      name: s.key,
      description: s.description,
      isSystem: true,
      systemKey: s.key,
    })),
    ...customRoles.map((c) => {
      const parent = customRoles.find((p) => p.id === c.parent_role_id);
      return {
        id: `cus:${c.id}`,
        ref: { kind: "custom" as const, id: c.id },
        label: c.label,
        name: c.name,
        description: c.description ?? "",
        isSystem: false,
        customRoleId: c.id,
        templateRole: c.template_role,
        parentLabel: parent?.label ?? null,
      };
    }),
  ];

  const filteredCargos = unifiedCargos.filter((c) => {
    if (cargoFilter === "system" && !c.isSystem) return false;
    if (cargoFilter === "custom" && c.isSystem) return false;
    if (cargoSearch) {
      const q = cargoSearch.toLowerCase();
      return (
        c.label.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const userHasCargo = (u: any, ref: CargoRef) =>
    ref.kind === "system" ? u.roles.includes(ref.key) : u.customRoleIds.includes(ref.id);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Acessos</h1>
          <p className="text-muted-foreground">
            Gestão unificada de cargos, permissões por módulo, obras autorizadas e histórico.
          </p>
        </div>
      </div>

      <Tabs defaultValue="users">
        <TabsList className="grid w-full grid-cols-4 max-w-xl">
          <TabsTrigger value="users">Usuários</TabsTrigger>
          <TabsTrigger value="cargos">Cargos ({unifiedCargos.length})</TabsTrigger>
          <TabsTrigger value="bulk">Atribuição em massa</TabsTrigger>
          <TabsTrigger value="audit">Histórico</TabsTrigger>
        </TabsList>

        {/* TAB 1: USUÁRIOS */}
        <TabsContent value="users" className="space-y-3">
          {usuarios.map((u: any) => {
            const open = expanded[u.id];
            return (
              <Card key={u.id} className="p-4 transition-all">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <button
                    onClick={() => setExpanded({ ...expanded, [u.id]: !open })}
                    className="flex items-center gap-2 text-left group"
                  >
                    <div className="p-1 rounded bg-muted text-muted-foreground group-hover:text-foreground">
                      {open ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{u.nome}</p>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                    </div>
                  </button>
                  <div className="flex gap-1.5 flex-wrap justify-end items-center">
                    {allCargos.map((c) => {
                      const has = userHasCargo(u, c.ref);
                      return (
                        <Button
                          key={cargoId(c.ref)}
                          size="sm"
                          variant={has ? "default" : "outline"}
                          className={cn(
                            "h-7 text-xs",
                            has && !c.system && "bg-indigo-600 hover:bg-indigo-700 text-white",
                          )}
                          onClick={() =>
                            toggleCargo.mutate({ user_id: u.id, cargo: c.ref, grant: !has })
                          }
                          title={c.system ? "Cargo do sistema" : "Cargo personalizado"}
                        >
                          {c.label}
                          {c.system ? (
                            <span className="ml-1 text-[10px] opacity-70 font-mono">•sis</span>
                          ) : (
                            <span className="ml-1 text-[10px] opacity-80 font-mono">•pers</span>
                          )}
                        </Button>
                      );
                    })}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => {
                        if (
                          confirm(
                            `Excluir o usuário "${u.nome}"? Esta ação remove perfil, cargos e permissões.`,
                          )
                        ) {
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
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-medium">Obras autorizadas</p>
                        <span className="text-xs text-muted-foreground">
                          {u.obras.length} obra(s) vinculada(s)
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mb-2.5">
                        Administrador e Gestor possuem acesso irrestrito a todas as obras. Para os
                        demais perfis, ative individualmente:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {obrasAll.map((o: any) => {
                          const has = u.obras.includes(o.id);
                          return (
                            <Button
                              key={o.id}
                              size="sm"
                              variant={has ? "default" : "outline"}
                              className="h-7 text-xs"
                              onClick={() =>
                                toggleObra.mutate({ user_id: u.id, obra_id: o.id, grant: !has })
                              }
                            >
                              {o.nome}
                            </Button>
                          );
                        })}
                        {obrasAll.length === 0 && (
                          <span className="text-xs text-muted-foreground">
                            Nenhuma obra cadastrada.
                          </span>
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-medium">Permissões por módulo</p>
                        <span className="text-xs text-muted-foreground">
                          Prioridade: <b className="text-primary">override</b> &gt; cargo &gt;
                          sistema
                        </span>
                      </div>
                      <div className="overflow-x-auto rounded border">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-muted-foreground border-b bg-muted/40">
                              <th className="py-2 px-3 font-medium">Módulo</th>
                              <th className="px-3 font-medium text-center">Visualizar</th>
                              <th className="px-3 font-medium text-center">Editar</th>
                              <th className="px-3 font-medium text-center">Excluir</th>
                              <th className="px-3 font-medium">Origem</th>
                              <th className="px-3"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {ALL_MODULES.map((m) => {
                              const override = u.perms.find((p: any) => p.module === m.key);
                              const eff = effectivePerm(
                                m.key,
                                u.roles,
                                u.perms,
                                u.customRoleIds,
                                customRolePerms,
                                systemRolePerms,
                              );
                              const update = (patch: Partial<ModulePerm>) => {
                                const next: ModulePerm = { ...eff, ...patch };
                                setPerm.mutate({ user_id: u.id, module: m.key, perm: next });
                              };
                              const fromCustom =
                                !override &&
                                u.customRoleIds.some((id: string) =>
                                  customRolePerms.some(
                                    (p) => p.custom_role_id === id && p.module === m.key,
                                  ),
                                );
                              return (
                                <tr
                                  key={m.key}
                                  className="border-b last:border-0 hover:bg-muted/20"
                                >
                                  <td className="py-2 px-3 font-medium">{m.label}</td>
                                  <td className="px-3 text-center">
                                    <Checkbox
                                      checked={eff.can_view}
                                      onCheckedChange={(v) => update({ can_view: !!v })}
                                    />
                                  </td>
                                  <td className="px-3 text-center">
                                    <Checkbox
                                      checked={eff.can_edit}
                                      onCheckedChange={(v) => update({ can_edit: !!v })}
                                    />
                                  </td>
                                  <td className="px-3 text-center">
                                    <Checkbox
                                      checked={eff.can_delete}
                                      onCheckedChange={(v) => update({ can_delete: !!v })}
                                    />
                                  </td>
                                  <td className="px-3 text-xs">
                                    {override ? (
                                      <Badge variant="default" className="text-[10px] py-0">
                                        override
                                      </Badge>
                                    ) : fromCustom ? (
                                      <Badge
                                        variant="secondary"
                                        className="text-[10px] py-0 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                                      >
                                        cargo
                                      </Badge>
                                    ) : (
                                      <span className="text-muted-foreground italic">sistema</span>
                                    )}
                                  </td>
                                  <td className="px-3 text-right">
                                    {override && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-6 text-xs text-muted-foreground hover:text-foreground"
                                        onClick={() =>
                                          clearOverride.mutate({ user_id: u.id, module: m.key })
                                        }
                                      >
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
          {usuarios.length === 0 && (
            <Card className="p-8 text-center text-muted-foreground">
              Nenhum usuário cadastrado.
            </Card>
          )}
        </TabsContent>

        {/* TAB 2: CARGOS UNIFICADOS */}
        <TabsContent value="cargos" className="space-y-4">
          <Card className="p-4 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-lg">Cargos e Permissões</h3>
                <p className="text-xs text-muted-foreground">
                  Gerencie todos os cargos da plataforma em um só lugar. Configure permissões por
                  módulo, crie novos cargos personalizados ou ajuste os cargos existentes.
                </p>
              </div>
              <CreateCustomRoleDialog
                customRoles={customRoles}
                onTemplate={(p) => createFromTemplate.mutate(p)}
                onInherit={(p) => createInherit.mutate(p)}
              />
            </div>

            {/* BARRA DE FILTRO E BUSCA UNIFICADA */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t">
              <div className="flex items-center gap-2 flex-1 min-w-[220px] max-w-md">
                <div className="relative w-full">
                  <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
                  <Input
                    placeholder="Filtrar cargo por nome ou descrição..."
                    value={cargoSearch}
                    onChange={(e) => setCargoSearch(e.target.value)}
                    className="pl-9 h-9 text-xs"
                  />
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant={cargoFilter === "all" ? "default" : "outline"}
                  onClick={() => setCargoFilter("all")}
                  className="h-8 text-xs"
                >
                  Todos ({unifiedCargos.length})
                </Button>
                <Button
                  size="sm"
                  variant={cargoFilter === "system" ? "default" : "outline"}
                  onClick={() => setCargoFilter("system")}
                  className="h-8 text-xs"
                >
                  <Shield className="h-3.5 w-3.5 mr-1" /> Sistema ({SYSTEM_ROLES.length})
                </Button>
                <Button
                  size="sm"
                  variant={cargoFilter === "custom" ? "default" : "outline"}
                  onClick={() => setCargoFilter("custom")}
                  className="h-8 text-xs"
                >
                  <Sparkles className="h-3.5 w-3.5 mr-1" /> Personalizados ({customRoles.length})
                </Button>
              </div>
            </div>

            {/* LISTA UNIFICADA DE CARGOS */}
            <div className="space-y-3 pt-2">
              {filteredCargos.map((cargo) => (
                <UnifiedCargoCard
                  key={cargo.id}
                  cargo={cargo}
                  customRoles={customRoles}
                  systemRolePerms={systemRolePerms}
                  customRolePerms={customRolePerms}
                  onUpdateSystemLabel={(p) => updateSystemRoleLabel.mutate(p)}
                  onSetSystemPerm={(p) => setSystemRolePerm.mutate(p)}
                  onUpdateCustomRole={(p) => updateCustomRole.mutate(p)}
                  onDeleteCustomRole={(id) => deleteCustomRole.mutate(id)}
                  onSetCustomPerm={(p) => setCustomRolePerm.mutate(p)}
                />
              ))}

              {filteredCargos.length === 0 && (
                <div className="p-8 text-center border rounded-lg bg-muted/20">
                  <p className="text-sm text-muted-foreground">
                    Nenhum cargo encontrado para os filtros selecionados.
                  </p>
                </div>
              )}
            </div>
          </Card>
        </TabsContent>

        {/* TAB 3: ATRIBUIÇÃO EM MASSA */}
        <TabsContent value="bulk">
          <BulkAssignPanel
            usuarios={usuarios}
            allCargos={allCargos}
            onBulk={(p) => bulkAssign.mutate(p)}
          />
        </TabsContent>

        {/* TAB 4: AUDITORIA / HISTÓRICO */}
        <TabsContent value="audit">
          <AuditPanel rows={auditLog} usuarios={usuarios} customRoles={customRoles} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/**
 * Cartão unificado para exibição e edição de cargos (Sistema ou Personalizado).
 */
function UnifiedCargoCard({
  cargo,
  customRoles,
  systemRolePerms,
  customRolePerms,
  onUpdateSystemLabel,
  onSetSystemPerm,
  onUpdateCustomRole,
  onDeleteCustomRole,
  onSetCustomPerm,
}: {
  cargo: UnifiedCargo;
  customRoles: CustomRole[];
  systemRolePerms: SystemRolePerm[];
  customRolePerms: CustomRolePerm[];
  onUpdateSystemLabel: (p: { role: AppRole; label: string; description: string }) => void;
  onSetSystemPerm: (p: { role: AppRole; module: AppModule; perm: ModulePerm }) => void;
  onUpdateCustomRole: (p: { id: string; name: string; label: string; description: string }) => void;
  onDeleteCustomRole: (id: string) => void;
  onSetCustomPerm: (p: { custom_role_id: string; module: AppModule; perm: ModulePerm }) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(cargo.label);
  const [name, setName] = useState(cargo.name);
  const [description, setDescription] = useState(cargo.description);
  const [openMatrix, setOpenMatrix] = useState(false);

  const isSystem = cargo.isSystem;

  const save = () => {
    if (isSystem && cargo.systemKey) {
      onUpdateSystemLabel({ role: cargo.systemKey, label: label.trim(), description });
    } else if (cargo.customRoleId) {
      onUpdateCustomRole({
        id: cargo.customRoleId,
        name: name.trim(),
        label: label.trim(),
        description,
      });
    }
    setEditing(false);
  };

  const getPermForModule = (m: AppModule): ModulePerm => {
    if (isSystem && cargo.systemKey) {
      const found = systemRolePerms.find((p) => p.role === cargo.systemKey && p.module === m);
      if (found)
        return { can_view: found.can_view, can_edit: found.can_edit, can_delete: found.can_delete };
      return effectivePerm(m, [cargo.systemKey], [], [], [], []);
    } else if (cargo.customRoleId) {
      const found = customRolePerms.find(
        (p) => p.custom_role_id === cargo.customRoleId && p.module === m,
      );
      return found
        ? { can_view: found.can_view, can_edit: found.can_edit, can_delete: found.can_delete }
        : { can_view: false, can_edit: false, can_delete: false };
    }
    return { can_view: false, can_edit: false, can_delete: false };
  };

  const updatePermForModule = (m: AppModule, patch: Partial<ModulePerm>) => {
    const cur = getPermForModule(m);
    const next = { ...cur, ...patch };
    if (isSystem && cargo.systemKey) {
      onSetSystemPerm({ role: cargo.systemKey, module: m, perm: next });
    } else if (cargo.customRoleId) {
      onSetCustomPerm({ custom_role_id: cargo.customRoleId, module: m, perm: next });
    }
  };

  // Contagem de módulos ativos
  const activeModulesCount = ALL_MODULES.filter((m) => getPermForModule(m.key).can_view).length;

  return (
    <Card
      className={cn(
        "border p-4 transition-all",
        isSystem ? "bg-muted/30 border-border" : "bg-card border-border hover:border-border/80",
      )}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        {editing ? (
          <div className="flex-1 space-y-2.5 min-w-[240px]">
            <div className="flex gap-2 flex-wrap">
              <div className="flex-1 min-w-[180px]">
                <Label className="text-xs font-medium">Rótulo visível</Label>
                <Input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              {!isSystem && (
                <div className="flex-1 min-w-[180px]">
                  <Label className="text-xs font-medium">Nome interno (slug)</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                </div>
              )}
            </div>
            <div>
              <Label className="text-xs font-medium">Descrição</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-semibold text-base text-foreground">{cargo.label}</h4>
              {isSystem ? (
                <Badge
                  variant="secondary"
                  className="text-[10px] gap-1 font-medium bg-primary/10 text-primary border-primary/20"
                >
                  <Shield className="h-3 w-3" /> Sistema ({cargo.name})
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="text-[10px] gap-1 font-medium bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950 dark:text-indigo-300 dark:border-indigo-800"
                >
                  <Sparkles className="h-3 w-3" /> Personalizado ({cargo.name})
                </Badge>
              )}
              {cargo.templateRole && (
                <span className="text-[11px] text-muted-foreground">
                  Base: <b>{cargo.templateRole}</b>
                </span>
              )}
              {cargo.parentLabel && (
                <span className="text-[11px] text-muted-foreground">
                  Herda de: <b>{cargo.parentLabel}</b>
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {cargo.description || "Sem descrição informada."}
            </p>
            <div className="pt-1 flex items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1 font-medium text-foreground">
                <SlidersHorizontal className="h-3.5 w-3.5" />
                {activeModulesCount} de {ALL_MODULES.length} módulos liberados
              </span>
            </div>
          </div>
        )}

        <div className="flex items-center gap-1.5">
          {editing ? (
            <>
              <Button size="sm" variant="default" onClick={save} className="h-7 text-xs gap-1">
                <Save className="h-3.5 w-3.5" /> Salvar
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditing(false);
                  setLabel(cargo.label);
                  setName(cargo.name);
                  setDescription(cargo.description);
                }}
                className="h-7 text-xs"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setOpenMatrix((v) => !v)}
                className="h-7 text-xs gap-1"
              >
                {openMatrix ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
                Permissões
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setEditing(true)}
                title="Editar cargo"
                className="h-7 w-7 p-0"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              {!isSystem && cargo.customRoleId && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (confirm(`Tem certeza que deseja remover o cargo "${cargo.label}"?`)) {
                      onDeleteCustomRole(cargo.customRoleId!);
                    }
                  }}
                  title="Excluir cargo personalizado"
                  className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* MATRIZ DE PERMISSÕES EXPANSÍVEL */}
      {openMatrix && (
        <div className="mt-4 pt-3 border-t">
          <div className="overflow-x-auto rounded border">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b bg-muted/50">
                  <th className="py-2 px-3 font-medium">Módulo</th>
                  <th className="px-3 font-medium text-center w-24">Visualizar</th>
                  <th className="px-3 font-medium text-center w-24">Editar</th>
                  <th className="px-3 font-medium text-center w-24">Excluir</th>
                </tr>
              </thead>
              <tbody>
                {ALL_MODULES.map((m) => {
                  const p = getPermForModule(m.key);
                  const lockedAcessosAdmin =
                    isSystem && cargo.systemKey === "admin" && m.key === "acessos";
                  return (
                    <tr key={m.key} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="py-2 px-3 font-medium">
                        {m.label}
                        {lockedAcessosAdmin && (
                          <span className="ml-2 text-[10px] text-muted-foreground italic">
                            (Protegido no admin)
                          </span>
                        )}
                      </td>
                      <td className="px-3 text-center">
                        <Checkbox
                          checked={p.can_view}
                          disabled={lockedAcessosAdmin}
                          onCheckedChange={(v) => updatePermForModule(m.key, { can_view: !!v })}
                        />
                      </td>
                      <td className="px-3 text-center">
                        <Checkbox
                          checked={p.can_edit}
                          disabled={lockedAcessosAdmin}
                          onCheckedChange={(v) => updatePermForModule(m.key, { can_edit: !!v })}
                        />
                      </td>
                      <td className="px-3 text-center">
                        <Checkbox
                          checked={p.can_delete}
                          disabled={lockedAcessosAdmin}
                          onCheckedChange={(v) => updatePermForModule(m.key, { can_delete: !!v })}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Card>
  );
}

/**
 * Modal unificado de criação de cargo personalizado
 */
function CreateCustomRoleDialog({
  customRoles,
  onTemplate,
  onInherit,
}: {
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

  const reset = () => {
    setName("");
    setLabel("");
    setDescription("");
    setTemplate("colaborador");
    setParentId("");
    setMode("template");
  };

  const submit = () => {
    const cleanName = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "_");
    if (!cleanName || !label.trim()) {
      toast.error("Preencha o rótulo e o nome interno.");
      return;
    }
    if (mode === "template") {
      onTemplate({
        name: cleanName,
        label: label.trim(),
        description: description.trim() || undefined,
        template,
      });
    } else {
      if (!parentId) {
        toast.error("Selecione o cargo pai.");
        return;
      }
      onInherit({
        name: cleanName,
        label: label.trim(),
        description: description.trim() || undefined,
        parent_id: parentId,
      });
    }
    setOpen(false);
    reset();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" /> Novo cargo
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Criar Novo Cargo</DialogTitle>
        </DialogHeader>
        <div className="space-y-3.5 py-2">
          <div className="grid grid-cols-2 gap-2 p-1 bg-muted rounded-md">
            <Button
              type="button"
              size="sm"
              variant={mode === "template" ? "default" : "ghost"}
              onClick={() => setMode("template")}
              className="text-xs"
            >
              A partir de cargo base
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === "inherit" ? "default" : "ghost"}
              onClick={() => setMode("inherit")}
              disabled={customRoles.length === 0}
              className="text-xs"
            >
              Herdar de existente
            </Button>
          </div>

          <div>
            <Label className="text-xs">Rótulo exibido</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Ex.: Supervisor de Obra, Comprador, Engenheiro Júnior"
              className="mt-1"
            />
          </div>

          <div>
            <Label className="text-xs">Nome interno (slug sem espaços)</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex.: supervisor_obra, comprador_materiais"
              className="mt-1 font-mono text-xs"
            />
          </div>

          <div>
            <Label className="text-xs">Descrição (opcional)</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Responsabilidades ou permissões do cargo"
              className="mt-1"
            />
          </div>

          {mode === "template" ? (
            <div>
              <Label className="text-xs">Cargo base de referência</Label>
              <Select value={template} onValueChange={(v) => setTemplate(v as AppRole)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TEMPLATES.map((r) => (
                    <SelectItem key={r} value={r} className="capitalize">
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground mt-1">
                As permissões padrão do cargo selecionado serão copiadas para iniciar.
              </p>
            </div>
          ) : (
            <div>
              <Label className="text-xs">Cargo pai</Label>
              <Select value={parentId} onValueChange={setParentId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Selecione o cargo pai" />
                </SelectTrigger>
                <SelectContent>
                  {customRoles.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground mt-1">
                As permissões do cargo selecionado serão copiadas como ponto de partida.
              </p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={submit}>Criar cargo</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Painel de Atribuição em Massa unificado
 */
function BulkAssignPanel({
  usuarios,
  allCargos,
  onBulk,
}: {
  usuarios: any[];
  allCargos: { ref: CargoRef; label: string; system: boolean }[];
  onBulk: (p: { user_ids: string[]; cargo: CargoRef; grant: boolean }) => void;
}) {
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [cargoKey, setCargoKey] = useState<string>("");
  const [filter, setFilter] = useState("");

  const filtered = useMemo(
    () =>
      usuarios.filter(
        (u) =>
          !filter ||
          u.nome?.toLowerCase().includes(filter.toLowerCase()) ||
          u.email?.toLowerCase().includes(filter.toLowerCase()),
      ),
    [usuarios, filter],
  );

  const selectedIds = Object.entries(selected)
    .filter(([, v]) => v)
    .map(([k]) => k);
  const allChecked = filtered.length > 0 && filtered.every((u) => selected[u.id]);
  const toggleAll = () => {
    const next = { ...selected };
    if (allChecked) filtered.forEach((u) => delete next[u.id]);
    else filtered.forEach((u) => (next[u.id] = true));
    setSelected(next);
  };

  const act = (grant: boolean) => {
    if (!cargoKey) {
      toast.error("Selecione um cargo");
      return;
    }
    if (selectedIds.length === 0) {
      toast.error("Selecione ao menos um usuário");
      return;
    }
    onBulk({ user_ids: selectedIds, cargo: parseCargoId(cargoKey), grant });
    setSelected({});
  };

  return (
    <Card className="p-4 space-y-4">
      <div>
        <h3 className="font-semibold text-base">Atribuição em Massa de Cargos</h3>
        <p className="text-xs text-muted-foreground">
          Selecione os usuários, escolha o cargo desejado e atribua ou remova para todos
          simultaneamente.
        </p>
      </div>

      <div className="flex flex-wrap gap-2.5 items-end pt-1">
        <div className="flex-1 min-w-[200px]">
          <Label className="text-xs font-medium">Filtrar usuários</Label>
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Nome ou e-mail..."
            className="mt-1 h-9 text-xs"
          />
        </div>
        <div className="min-w-[240px]">
          <Label className="text-xs font-medium">Cargo</Label>
          <Select value={cargoKey} onValueChange={setCargoKey}>
            <SelectTrigger className="mt-1 h-9 text-xs">
              <SelectValue placeholder="Selecione o cargo" />
            </SelectTrigger>
            <SelectContent>
              {allCargos.map((c) => (
                <SelectItem key={cargoId(c.ref)} value={cargoId(c.ref)}>
                  {c.label} {c.system ? "(Sistema)" : "(Personalizado)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          onClick={() => act(true)}
          disabled={selectedIds.length === 0 || !cargoKey}
          className="h-9 text-xs"
        >
          Atribuir a {selectedIds.length}
        </Button>
        <Button
          variant="outline"
          onClick={() => act(false)}
          disabled={selectedIds.length === 0 || !cargoKey}
          className="h-9 text-xs"
        >
          Remover de {selectedIds.length}
        </Button>
      </div>

      <div className="overflow-x-auto rounded border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-muted-foreground">
              <th className="py-2.5 px-3 w-10">
                <Checkbox checked={allChecked} onCheckedChange={toggleAll} />
              </th>
              <th className="py-2.5 pr-3 font-medium">Usuário</th>
              <th className="py-2.5 pr-3 font-medium">E-mail</th>
              <th className="py-2.5 pr-3 font-medium">Cargos Atribuídos</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => {
              const userCargos = allCargos.filter((c) =>
                c.system
                  ? u.roles.includes((c.ref as any).key)
                  : u.customRoleIds.includes((c.ref as any).id),
              );

              return (
                <tr key={u.id} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="px-3">
                    <Checkbox
                      checked={!!selected[u.id]}
                      onCheckedChange={(v) => setSelected({ ...selected, [u.id]: !!v })}
                    />
                  </td>
                  <td className="py-2.5 pr-3 font-medium">{u.nome}</td>
                  <td className="py-2.5 pr-3 text-xs text-muted-foreground">{u.email}</td>
                  <td className="py-2.5 pr-3">
                    <div className="flex flex-wrap gap-1">
                      {userCargos.map((c) => (
                        <Badge
                          key={cargoId(c.ref)}
                          variant={c.system ? "secondary" : "outline"}
                          className={cn(
                            "text-[10px] py-0",
                            !c.system &&
                              "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950 dark:text-indigo-300 dark:border-indigo-800",
                          )}
                        >
                          {c.label}
                        </Badge>
                      ))}
                      {userCargos.length === 0 && (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="py-6 text-center text-muted-foreground text-sm">
                  Nenhum usuário encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/**
 * Painel de Histórico de Auditoria
 */
function AuditPanel({
  rows,
  usuarios,
  customRoles,
}: {
  rows: any[];
  usuarios: any[];
  customRoles: CustomRole[];
}) {
  const userMap = useMemo(() => Object.fromEntries(usuarios.map((u) => [u.id, u])), [usuarios]);
  const roleMap = useMemo(
    () => Object.fromEntries(customRoles.map((c) => [c.id, c])),
    [customRoles],
  );

  const describe = (r: any) => {
    const target = r.target_user_id
      ? (userMap[r.target_user_id]?.nome ?? r.target_user_id.slice(0, 8))
      : null;
    const cargo = r.custom_role_id
      ? (roleMap[r.custom_role_id]?.label ?? r.details?.label ?? "cargo")
      : null;
    const d = r.details ?? {};
    switch (r.action) {
      case "role_grant":
        return `Atribuiu cargo do sistema "${d.role}" para ${target}`;
      case "role_revoke":
        return `Removeu cargo do sistema "${d.role}" de ${target}`;
      case "custom_role_assign":
        return `Atribuiu cargo "${cargo}" para ${target}`;
      case "custom_role_unassign":
        return `Removeu cargo "${cargo}" de ${target}`;
      case "override_set":
        return `Override em "${r.module}" para ${target} (V:${d.can_view ? "✓" : "✗"} E:${d.can_edit ? "✓" : "✗"} X:${d.can_delete ? "✓" : "✗"})`;
      case "override_clear":
        return `Removeu override de "${r.module}" para ${target}`;
      case "custom_role_perm_set":
        return `Cargo "${cargo}" módulo "${r.module}" (V:${d.can_view ? "✓" : "✗"} E:${d.can_edit ? "✓" : "✗"} X:${d.can_delete ? "✓" : "✗"})`;
      case "custom_role_created":
        return `Criou cargo "${d.label}"`;
      case "custom_role_deleted":
        return `Excluiu cargo "${d.label}"`;
      case "custom_role_updated":
        return `Atualizou cargo "${d.label}"`;
      default:
        return r.action;
    }
  };

  return (
    <Card className="p-4">
      <h3 className="font-semibold text-base mb-3">Histórico de Alterações de Acessos</h3>
      <div className="overflow-x-auto rounded border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-muted-foreground">
              <th className="py-2.5 px-3 font-medium">Data</th>
              <th className="py-2.5 pr-3 font-medium">Autor</th>
              <th className="py-2.5 pr-3 font-medium">Ação Realizada</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b last:border-0 hover:bg-muted/20">
                <td className="py-2.5 px-3 text-xs text-muted-foreground whitespace-nowrap font-mono">
                  {format(new Date(r.created_at), "dd/MM/yyyy HH:mm")}
                </td>
                <td className="py-2.5 pr-3 text-xs font-medium">{r.actor_email ?? "—"}</td>
                <td className="py-2.5 pr-3 text-xs">{describe(r)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={3} className="py-6 text-center text-muted-foreground text-sm">
                  Nenhum evento registrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
