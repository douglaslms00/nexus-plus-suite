import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  isAdmin,
  canManage,
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
  Sparkles,
  SlidersHorizontal,
  Users,
  History,
  Clock,
  ArrowUpCircle,
  ArrowDownCircle,
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
    enabled: canManage(roles),
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
    enabled: canManage(roles),
    staleTime: 1000 * 60 * 5,
    queryFn: async () => (await supabase.from("obras").select("id, nome").order("nome")).data ?? [],
  });

  const { data: customRoles = [] } = useQuery({
    queryKey: ["custom-roles-admin"],
    enabled: canManage(roles),
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
    enabled: canManage(roles),
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
    enabled: canManage(roles),
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
    enabled: canManage(roles),
    staleTime: 1000 * 30,
    retry: 1,
    queryFn: async () => {
      try {
        const { data } = await (supabase as any)
          .from("permission_audit_log")
          .select(
            "id, created_at, actor_email, action, target_user_id, custom_role_id, module, details",
          )
          .order("created_at", { ascending: false })
          .limit(200);
        return data ?? [];
      } catch (e: any) {
        console.warn("[acessos] audit log indisponível:", e?.message ?? e);
        return [];
      }
    },
  });

  // Histórico de logins por perfil (tabela login_history; vazia até a migration
  // 20260915000000_login_history.sql ser aplicada — nunca trava a tela).
  const { data: loginHistory = [], error: loginHistoryError } = useQuery({
    queryKey: ["login-history"],
    enabled: canManage(roles),
    staleTime: 1000 * 60,
    retry: 1,
    queryFn: async () => {
      try {
        const { data, error } = await (supabase as any)
          .from("login_history")
          .select("user_id, email, login_at, user_agent")
          .order("login_at", { ascending: false })
          .limit(500);
        if (error) throw error;
        return data ?? [];
      } catch (e: any) {
        console.warn("[acessos] login_history indisponível:", e?.message ?? e);
        throw e;
      }
    },
  });
  const loginTableMissing =
    (loginHistoryError as any)?.code === "PGRST205" ||
    /schema cache|does not exist|relation/i.test(
      String((loginHistoryError as any)?.message ?? ""),
    );

  // Agrupa logins por usuário para o histórico individual de cada perfil.
  const loginsPorUsuario = useMemo(() => {
    const m = new Map<string, { login_at: string; email: string | null; user_agent: string | null }[]>();
    for (const l of loginHistory as any[]) {
      if (!l?.user_id) continue;
      const list = m.get(l.user_id) ?? [];
      list.push(l);
      m.set(l.user_id, list);
    }
    return m;
  }, [loginHistory]);

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["all-users-perms"] });
    qc.invalidateQueries({ queryKey: ["login-history"] });
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
  const [userSearch, setUserSearch] = useState("");
  const [userCargoFilter, setUserCargoFilter] = useState<string>("all");

  if (!canManage(roles)) {
    return (
      <Card className="p-8 text-center text-muted-foreground">
        Acesso restrito a administradores e gestores.
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
        <TabsList className="grid w-full grid-cols-5 max-w-2xl">
          <TabsTrigger value="users">Usuários ({usuarios.length})</TabsTrigger>
          <TabsTrigger value="cargos">Cargos ({unifiedCargos.length})</TabsTrigger>
          <TabsTrigger value="bulk">Em massa</TabsTrigger>
          <TabsTrigger value="audit">Histórico</TabsTrigger>
          <TabsTrigger value="logins">Logins</TabsTrigger>
        </TabsList>

        {/* TAB 1: USUÁRIOS — cadastro, promoção a gestor e histórico de login */}
        <TabsContent value="users" className="space-y-4">

          {/* CRIAR LOGIN DE ACESSO */}
          <CreateUserLoginCard
            customRoles={customRoles}
            systemRoles={SYSTEM_ROLES}
            onUserCreated={invalidateAll}
          />

          {/* BUSCA + FILTRO DE USUÁRIOS */}
          <Card className="p-3 flex flex-col sm:flex-row gap-2 sm:items-center">
            <div className="relative flex-1">
              <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input
                placeholder="Buscar usuário por nome ou e-mail..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="pl-9 h-9 text-xs"
              />
            </div>
            <Select value={userCargoFilter} onValueChange={setUserCargoFilter}>
              <SelectTrigger className="h-9 text-xs sm:w-56">
                <SelectValue placeholder="Filtrar por cargo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os cargos</SelectItem>
                <SelectItem value="none">Sem cargo atribuído</SelectItem>
                {allCargos.map((c) => (
                  <SelectItem key={cargoId(c.ref)} value={cargoId(c.ref)}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Card>

          {/* LISTA DE USUÁRIOS */}
          {usuarios
            .filter((u: any) => {
              if (userSearch) {
                const q = userSearch.toLowerCase();
                const hit =
                  (u.nome ?? "").toLowerCase().includes(q) ||
                  (u.email ?? "").toLowerCase().includes(q);
                if (!hit) return false;
              }
              if (userCargoFilter !== "all") {
                if (userCargoFilter === "none") {
                  const temCargo =
                    (u.roles ?? []).length > 0 || (u.customRoleIds ?? []).length > 0;
                  if (temCargo) return false;
                } else if (!userHasCargo(u, parseCargoId(userCargoFilter))) {
                  return false;
                }
              }
              return true;
            })
            .map((u: any) => {
            const open = expanded[u.id];
            const isGestor = (u.roles ?? []).includes("gestor");
            const isUserAdmin = (u.roles ?? []).includes("admin");
            const logins = loginsPorUsuario.get(u.id) ?? [];
            const lastLogin = logins[0]?.login_at ?? null;
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
                      <p className="font-medium text-foreground flex items-center gap-1.5 flex-wrap">
                        {u.nome}
                        {isUserAdmin && (
                          <Badge variant="default" className="text-[10px] py-0 h-4">
                            <Shield className="h-2.5 w-2.5 mr-0.5" /> Admin
                          </Badge>
                        )}
                        {isGestor && !isUserAdmin && (
                          <Badge variant="secondary" className="text-[10px] py-0 h-4">
                            Gestor
                          </Badge>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                      <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Clock className="h-3 w-3" />
                        {lastLogin ? (
                          <>Último login: {format(new Date(lastLogin), "dd/MM/yyyy HH:mm")}{logins.length > 1 ? ` · ${logins.length} acessos` : ""}</>
                        ) : (
                          "Nunca logou (ou histórico indisponível)"
                        )}
                      </p>
                    </div>
                  </button>
                  <div className="flex gap-1.5 flex-wrap justify-end items-center">
                    {/* PROMOÇÃO RÁPIDA A GESTOR */}
                    {!isGestor ? (
                      <Button
                        size="sm"
                        className="h-7 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={() =>
                          toggleCargo.mutate({
                            user_id: u.id,
                            cargo: { kind: "system", key: "gestor" },
                            grant: true,
                          })
                        }
                        title="Promover este usuário a gestor"
                      >
                        <ArrowUpCircle className="h-3.5 w-3.5" /> Promover a gestor
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1"
                        onClick={() =>
                          toggleCargo.mutate({
                            user_id: u.id,
                            cargo: { kind: "system", key: "gestor" },
                            grant: false,
                          })
                        }
                        title="Remover o cargo de gestor"
                      >
                        <ArrowDownCircle className="h-3.5 w-3.5" /> Rebaixar gestor
                      </Button>
                    )}
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
                    {/* HISTÓRICO DE LOGIN DO PERFIL */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-medium flex items-center gap-1.5">
                          <History className="h-4 w-4 text-muted-foreground" /> Histórico de login
                        </p>
                        <span className="text-xs text-muted-foreground">
                          {logins.length} acesso(s) registrado(s)
                        </span>
                      </div>
                      {loginTableMissing ? (
                        <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded p-2.5">
                          Tabela de logins ainda não existe no banco. Aplique a migration{" "}
                          <code className="font-mono">20260915000000_login_history.sql</code> no
                          Supabase SQL Editor para começar a registrar os acessos.
                        </p>
                      ) : logins.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          Nenhum acesso registrado para este perfil ainda. Os logins passam a ser
                          contabilizados automaticamente a partir de agora.
                        </p>
                      ) : (
                        <div className="overflow-x-auto rounded border max-h-48 overflow-y-auto">
                          <table className="w-full text-sm">
                            <tbody>
                              {logins.slice(0, 10).map((l, idx) => (
                                <tr key={idx} className="border-b last:border-0 hover:bg-muted/20">
                                  <td className="py-1.5 px-3 text-xs font-mono whitespace-nowrap">
                                    {format(new Date(l.login_at), "dd/MM/yyyy HH:mm")}
                                  </td>
                                  <td className="py-1.5 pr-3 text-xs text-muted-foreground truncate max-w-[280px]">
                                    {l.user_agent ?? "—"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

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
          {usuarios.length > 0 && userSearch && usuarios.filter((u: any) => {
            const q = userSearch.toLowerCase();
            return (
              (u.nome ?? "").toLowerCase().includes(q) ||
              (u.email ?? "").toLowerCase().includes(q)
            );
          }).length === 0 && (
            <Card className="p-8 text-center text-muted-foreground">
              Nenhum usuário encontrado para a busca.
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

        {/* TAB 5: LOGINS — histórico global de acessos por perfil */}
        <TabsContent value="logins">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div>
                <h3 className="font-semibold text-base flex items-center gap-1.5">
                  <History className="h-4 w-4" /> Logins recentes
                </h3>
                <p className="text-xs text-muted-foreground">
                  Últimos acessos registrados por perfil (a partir da ativação do registro).
                </p>
              </div>
              <Badge variant="secondary" className="text-xs">
                {(loginHistory as any[]).length} registro(s)
              </Badge>
            </div>
            {loginTableMissing ? (
              <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded p-3">
                Tabela de logins ainda não existe no banco. Aplique a migration{" "}
                <code className="font-mono">20260915000000_login_history.sql</code> no Supabase
                SQL Editor para começar a registrar os acessos automaticamente.
              </p>
            ) : (
              <div className="overflow-x-auto rounded border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-left text-muted-foreground">
                      <th className="py-2.5 px-3 font-medium">Data</th>
                      <th className="py-2.5 pr-3 font-medium">Usuário</th>
                      <th className="py-2.5 pr-3 font-medium">Dispositivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(loginHistory as any[]).slice(0, 100).map((l: any, idx: number) => (
                      <tr key={idx} className="border-b last:border-0 hover:bg-muted/20">
                        <td className="py-2.5 px-3 text-xs text-muted-foreground whitespace-nowrap font-mono">
                          {format(new Date(l.login_at), "dd/MM/yyyy HH:mm")}
                        </td>
                        <td className="py-2.5 pr-3 text-xs font-medium">
                          {usuarios.find((u: any) => u.id === l.user_id)?.nome ?? l.email ?? l.user_id.slice(0, 8)}
                        </td>
                        <td className="py-2.5 pr-3 text-xs text-muted-foreground truncate max-w-[320px]">
                          {l.user_agent ?? "—"}
                        </td>
                      </tr>
                    ))}
                    {(loginHistory as any[]).length === 0 && (
                      <tr>
                        <td colSpan={3} className="py-6 text-center text-muted-foreground text-sm">
                          Nenhum login registrado ainda. Os acessos passam a ser contabilizados
                          automaticamente.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
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

/**
 * Card para criar um novo login de acesso (admin/gestor cria conta para usuário)
 */
function CreateUserLoginCard({
  customRoles,
  systemRoles,
  onUserCreated,
}: {
  customRoles: CustomRole[];
  systemRoles: { key: AppRole; label: string; description: string }[];
  onUserCreated: () => void;
}) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [cargoKey, setCargoKey] = useState("");
  const [isAdmin, setIsAdminCheck] = useState(false);
  const [loading, setLoading] = useState(false);
  // True quando a função admin_create_user_login não existe no banco (migration pendente).
  const [rpcAusente, setRpcAusente] = useState(false);
  // Último erro bruto do RPC, exibido no banner para diagnóstico.
  const [ultimoErroRpc, setUltimoErroRpc] = useState<string | null>(null);

  const allCargosOptions = [
    ...systemRoles.map((s) => ({ value: `sys:${s.key}`, label: s.label })),
    ...customRoles.map((c) => ({ value: `cus:${c.id}`, label: c.label })),
  ];

  const validarSenha = (senha: string) => {
    const minuscula = /[a-z]/.test(senha);
    const maiuscula = /[A-Z]/.test(senha);
    const numero = /[0-9]/.test(senha);
    const especial = /[!@#$%^&*(),.?":{}|<>]/.test(senha);
    const pontos = [minuscula, maiuscula, numero, especial].filter(Boolean).length;
    const forca =
      senha.length >= 8 && pontos >= 3 ? "forte" : senha.length >= 6 && pontos >= 2 ? "média" : "fraca";
    return { minuscula, maiuscula, numero, especial, forca };
  };

  const senhaInfo = validarSenha(password);
  const senhaValida = senhaInfo.forca === "forte";

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim() || !email.trim() || !password) {
      toast.error("Preencha nome, e-mail e senha.");
      return;
    }
    if (!senhaValida) {
      toast.error("A senha deve ser forte (mín. 8 caracteres, maiúsc., minúsc., número e especial).");
      return;
    }

    setLoading(true);
    try {
      // Cria o usuário via RPC admin (sem necessidade de confirmação de e-mail)
      const { error } = await (supabase as any).rpc("admin_create_user_login", {
        _email: email.trim().toLowerCase(),
        _password: password,
        _nome: nome.trim(),
        _is_admin: isAdmin,
        _cargo_key: cargoKey || null,
      });

      let usouFallback = false;
      if (error) {
        const code = String((error as any)?.code ?? "");
        const msg = String((error as any)?.message ?? "");
        // Só considera "função ausente" o erro de schema cache do PostgREST.
        // Qualquer outro erro (ex.: pgcrypto ausente -> 42883 dentro da função,
        // permission denied -> 42501) é lançado como está, para diagnóstico.
        const schemaCacheMiss =
          code === "PGRST202" ||
          /Could not find the function/i.test(msg) ||
          /in the schema cache/i.test(msg);
        if (!schemaCacheMiss) {
          setUltimoErroRpc(`${code ? `[${code}] ` : ""}${msg}`.slice(0, 300));
          // Erro clássico: pgcrypto fora do search_path -> gen_salt/crypt invisíveis.
          // Orienta aplicar a migration de correção em vez de mostrar o erro bruto.
          if (code === "42883" || /gen_salt|crypt/i.test(msg)) {
            throw new Error(
              "Falha de configuração no banco (pgcrypto/gen_salt). " +
                "Rode no Supabase SQL Editor a migration " +
                "20260916000000_fix_admin_create_user_auth_columns.sql e tente de novo.",
            );
          }
          // GoTrue retorna "Database error querying schema" quando auth.users tem
          // NULL nas colunas de token (INSERT manual incompleto). A migration
          // 20260916000000 corrige a função + limpa os NULLs para ''.
          if (/querying schema|confirmation_token|converting NULL to string/i.test(msg)) {
            throw new Error(
              "Banco com usuários incompletos em auth.users (NULL em colunas de token). " +
                "Rode no Supabase SQL Editor a migration " +
                "20260916000000_fix_admin_create_user_auth_columns.sql e tente de novo.",
            );
          }
          throw error;
        }
        setUltimoErroRpc(`${code ? `[${code}] ` : ""}${msg}`.slice(0, 300));

        // Contingência: a migration da função ainda não foi aplicada no banco.
        // Usa o cadastro normal (o trigger handle_new_user cria o perfil).
        // OBS: nunca usar supabase.auth.admin no frontend — exige service_role (backend).
        console.warn(
          "[acessos] RPC admin_create_user_login ausente no banco; usando signUp. " +
            "Aplique a migration 20260914180000_admin_create_user_login.sql no Supabase SQL Editor.",
        );
        setRpcAusente(true);
        const { error: signupErr } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options: { data: { nome: nome.trim() } },
        });
        if (signupErr) throw signupErr;
        usouFallback = true;
      }

      if (usouFallback) {
        toast.warning(
          `Login "${nome.trim()}" pré-cadastrado — ele precisa confirmar o e-mail para entrar. ` +
            `Para criar direto sem confirmação, aplique a migration 20260914180000_admin_create_user_login.sql. ` +
            `Depois atribua o cargo na lista abaixo.`,
          { duration: 8000 },
        );
      } else {
        setRpcAusente(false);
        toast.success(`Usuário "${nome.trim()}" criado com sucesso!`);
      }
      setNome("");
      setEmail("");
      setPassword("");
      setCargoKey("");
      setIsAdminCheck(false);
      onUserCreated();
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao criar usuário.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="p-5 border-2 border-primary/20 bg-primary/5">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-1.5 rounded-md bg-primary/15">
          <svg
            className="h-4 w-4 text-primary"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </div>
        <div>
          <h3 className="font-semibold text-sm text-foreground">Criar login de acesso</h3>
          <p className="text-xs text-primary/80">
            Cadastre um novo usuário com e-mail e senha. Escolha o cargo inicial (ex.: Gestor)
            ou marque como administrador — depois ajuste obras e permissões na lista abaixo.
          </p>
        </div>
      </div>

      {rpcAusente && (
        <div className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded p-2.5 mb-4 space-y-1.5">
          <p>
            Criação direta indisponível: a função{" "}
            <code className="font-mono">admin_create_user_login</code> não está visível para a API.
            Reaplique a migration{" "}
            <code className="font-mono">20260914180000_admin_create_user_login.sql</code> no Supabase
            SQL Editor (ela agora inclui <code className="font-mono">pgcrypto</code> + reload do schema
            cache). Enquanto isso, o cadastro usa confirmação por e-mail e o cargo deve ser
            atribuído na lista abaixo.
          </p>
          {ultimoErroRpc && (
            <p className="font-mono text-[11px] break-words opacity-90">
              Erro retornado: {ultimoErroRpc}
            </p>
          )}
        </div>
      )}

      <form onSubmit={handleCreate} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="new-user-nome" className="text-sm">Nome completo</Label>
            <Input
              id="new-user-nome"
              placeholder="João Silva"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-user-email" className="text-sm">E-mail</Label>
            <Input
              id="new-user-email"
              type="email"
              placeholder="joao@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="new-user-password" className="text-sm">Senha (forte)</Label>
            <div className="relative">
              <Input
                id="new-user-password"
                type={showPassword ? "text" : "password"}
                placeholder="Mín. 8 caracteres, maiúsc, minúsc, número e caractere especial"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="pr-9 text-xs placeholder:text-xs"
              />
              <button
                type="button"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowPassword((v) => !v)}
                tabIndex={-1}
              >
                {showPassword ? (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                ) : (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                )}
              </button>
            </div>
            {password && (
              <p
                className={cn(
                  "text-xs font-medium",
                  senhaInfo.forca === "forte"
                    ? "text-green-600"
                    : senhaInfo.forca === "média"
                      ? "text-yellow-600"
                      : "text-destructive",
                )}
              >
                Força: {senhaInfo.forca}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="new-user-cargo" className="text-sm">Cargo (opcional)</Label>
            <Select value={cargoKey} onValueChange={setCargoKey}>
              <SelectTrigger id="new-user-cargo">
                <SelectValue placeholder="Selecione um cargo" />
              </SelectTrigger>
              <SelectContent>
                {allCargosOptions.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id="new-user-admin"
            checked={isAdmin}
            onCheckedChange={(v) => setIsAdminCheck(!!v)}
          />
          <label htmlFor="new-user-admin" className="text-sm cursor-pointer select-none">
            Marcar como administrador
          </label>
        </div>

        <div>
          <Button type="submit" disabled={loading} className="gap-2">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            {loading ? "Criando..." : "Criar usuário"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
