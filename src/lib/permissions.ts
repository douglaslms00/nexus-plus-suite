import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Obra } from "@/integrations/supabase/database.types";

export type AppRole = "admin" | "gestor" | "colaborador" | "financeiro";

export type AppModule =
  | "dashboard"
  | "funcionarios"
  | "tarefas"
  | "obras"
  | "ativos"
  | "ferramentas"
  | "materiais"
  | "epis"
  | "financeiro"
  | "prestacao"
  | "documentos"
  | "acessos";

export const ALL_MODULES: { key: AppModule; label: string }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "funcionarios", label: "Funcionários" },
  { key: "tarefas", label: "Tarefas" },
  { key: "obras", label: "Obras" },
  { key: "ativos", label: "Ativos" },
  { key: "ferramentas", label: "Ferramentas" },
  { key: "materiais", label: "Materiais" },
  { key: "epis", label: "EPI / EPC" },
  { key: "financeiro", label: "Financeiro" },
  { key: "prestacao", label: "Prestação de contas" },
  { key: "documentos", label: "Documentos" },
  { key: "acessos", label: "Acessos" },
];

export function useCurrentUser() {
  return useQuery({
    queryKey: ["currentUser"],
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user) return session.user;
      return (await supabase.auth.getUser()).data.user;
    },
  });
}

export function useUserRoles() {
  const { data: user } = useCurrentUser();
  return useQuery({
    queryKey: ["userRoles", user?.id],
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 5,
    queryFn: async (): Promise<AppRole[]> => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user!.id);
      if (error) throw error;
      return (data ?? []).map((r) => r.role as AppRole);
    },
  });
}

export function useProfile() {
  const { data: user } = useCurrentUser();
  return useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, nome, setor, avatar_url, created_at, updated_at")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export type ModulePerm = { can_view: boolean; can_edit: boolean; can_delete: boolean };

export function useMyModulePermissions() {
  const { data: user } = useCurrentUser();
  return useQuery({
    queryKey: ["my-module-perms", user?.id],
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_module_permissions")
        .select("module, can_view, can_edit, can_delete")
        .eq("user_id", user!.id);
      if (error) throw error;
      return (data ?? []) as ({ module: AppModule } & ModulePerm)[];
    },
  });
}

export function hasAny(roles: AppRole[] | undefined, ...check: AppRole[]) {
  if (!roles) return false;
  return check.some((r) => roles.includes(r));
}
export function isAdmin(roles?: AppRole[]) {
  return hasAny(roles, "admin");
}
export function canManage(roles?: AppRole[]) {
  return hasAny(roles, "admin", "gestor");
}
export function canFinance(roles?: AppRole[]) {
  return hasAny(roles, "admin", "gestor", "financeiro");
}

// Obras que o usuário pode acessar.
// Admin/Gestor: todas as obras. Outros: somente as vinculadas em user_obras.
export function useAuthorizedObras() {
  const { data: user } = useCurrentUser();
  const { data: roles } = useUserRoles();
  const rolesKey = roles ? [...roles].sort().join(",") : "";
  return useQuery({
    queryKey: ["authorized-obras", user?.id, rolesKey],
    enabled: !!user?.id && !!roles,
    staleTime: 1000 * 60 * 5,
    queryFn: async (): Promise<{ id: string; nome: string }[]> => {
      if (canManage(roles)) {
        const { data, error } = await supabase.from("obras").select("id, nome").order("nome");
        if (error) throw error;
        return data ?? [];
      }
      const { data, error } = await supabase
        .from("user_obras")
        .select("obra:obras(id, nome)")
        .eq("user_id", user!.id);
      if (error) throw error;
      return (data ?? [])
        .map((r: { obra: { id: string; nome: string } | null }) => r.obra)
        .filter((o): o is { id: string; nome: string } => !!o)
        .sort((a, b) => a.nome.localeCompare(b.nome));
    },
  });
}

export type SystemRolePerm = { role: AppRole; module: AppModule } & ModulePerm;

export function useAllSystemRolePerms() {
  return useQuery({
    queryKey: ["all-system-role-perms"],
    staleTime: 1000 * 60 * 5,
    queryFn: async (): Promise<SystemRolePerm[]> => {
      const { data, error } = await supabase
        .from("system_role_module_permissions")
        .select("role, module, can_view, can_edit, can_delete");
      if (error) throw error;
      return (data ?? []) as SystemRolePerm[];
    },
  });
}

function fallbackPerm(module: AppModule, roles: AppRole[] | undefined): ModulePerm {
  const r = roles ?? [];
  if (r.includes("admin")) return { can_view: true, can_edit: true, can_delete: true };
  if (module === "acessos") return { can_view: false, can_edit: false, can_delete: false };
  if (r.includes("gestor")) return { can_view: true, can_edit: true, can_delete: false };
  if (r.includes("financeiro")) {
    if (module === "financeiro") return { can_view: true, can_edit: true, can_delete: false };
    return { can_view: true, can_edit: false, can_delete: false };
  }
  const baseView: AppModule[] = [
    "dashboard",
    "tarefas",
    "funcionarios",
    "epis",
    "documentos",
    "prestacao",
  ];
  return {
    can_view: baseView.includes(module),
    can_edit: module === "prestacao",
    can_delete: false,
  };
}

function defaultPerm(
  module: AppModule,
  roles: AppRole[] | undefined,
  systemPerms?: SystemRolePerm[],
): ModulePerm {
  const r = roles ?? [];
  if (!systemPerms?.length) return fallbackPerm(module, r);
  // admin sempre tem tudo (guarda-corpo no servidor também)
  if (r.includes("admin")) return { can_view: true, can_edit: true, can_delete: true };
  const matches = systemPerms.filter((p) => p.module === module && r.includes(p.role));
  if (!matches.length) return fallbackPerm(module, r);
  return {
    can_view: matches.some((m) => m.can_view),
    can_edit: matches.some((m) => m.can_edit),
    can_delete: matches.some((m) => m.can_delete),
  };
}

// Custom roles: assigned to user via user_custom_roles, with their own module perms
export type CustomRole = {
  id: string;
  name: string;
  label: string;
  description: string | null;
  parent_role_id?: string | null;
  template_role?: AppRole | null;
};
export type CustomRolePerm = { custom_role_id: string; module: AppModule } & ModulePerm;

export function useMyCustomRoles() {
  const { data: user } = useCurrentUser();
  return useQuery({
    queryKey: ["my-custom-roles", user?.id],
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 5,
    queryFn: async (): Promise<CustomRole[]> => {
      const { data, error } = await supabase
        .from("user_custom_roles")
        .select("custom_role:custom_roles(id, name, label, description)")
        .eq("user_id", user!.id);
      if (error) throw error;
      return (data ?? [])
        .map((r: { custom_role: CustomRole | null }) => r.custom_role)
        .filter((c): c is CustomRole => !!c);
    },
  });
}

export function useAllCustomRolePerms() {
  return useQuery({
    queryKey: ["all-custom-role-perms"],
    staleTime: 1000 * 60 * 5,
    queryFn: async (): Promise<CustomRolePerm[]> => {
      const { data, error } = await supabase
        .from("custom_role_module_permissions")
        .select("custom_role_id, module, can_view, can_edit, can_delete");
      if (error) throw error;
      return (data ?? []) as CustomRolePerm[];
    },
  });
}

function mergeCustomPerms(
  module: AppModule,
  customRoleIds: string[],
  customPerms: CustomRolePerm[] | undefined,
): ModulePerm | null {
  if (!customRoleIds.length || !customPerms?.length) return null;
  const matches = customPerms.filter(
    (p) => customRoleIds.includes(p.custom_role_id) && p.module === module,
  );
  if (!matches.length) return null;
  return {
    can_view: matches.some((m) => m.can_view),
    can_edit: matches.some((m) => m.can_edit),
    can_delete: matches.some((m) => m.can_delete),
  };
}

export function useModulePerm(module: AppModule): ModulePerm {
  const { data: roles } = useUserRoles();
  const { data: overrides } = useMyModulePermissions();
  const { data: customRoles } = useMyCustomRoles();
  const { data: customPerms } = useAllCustomRolePerms();
  const { data: systemPerms } = useAllSystemRolePerms();
  const o = overrides?.find((x) => x.module === module);
  if (o) return { can_view: o.can_view, can_edit: o.can_edit, can_delete: o.can_delete };
  const fromCustom = mergeCustomPerms(
    module,
    (customRoles ?? []).map((c) => c.id),
    customPerms,
  );
  if (fromCustom) return fromCustom;
  return defaultPerm(module, roles, systemPerms);
}

export function effectivePerm(
  module: AppModule,
  roles: AppRole[] | undefined,
  overrides: ({ module: AppModule } & ModulePerm)[] | undefined,
  customRoleIds: string[] = [],
  customPerms: CustomRolePerm[] = [],
  systemPerms: SystemRolePerm[] = [],
): ModulePerm {
  const o = overrides?.find((x) => x.module === module);
  if (o) return { can_view: o.can_view, can_edit: o.can_edit, can_delete: o.can_delete };
  const fromCustom = mergeCustomPerms(module, customRoleIds, customPerms);
  if (fromCustom) return fromCustom;
  return defaultPerm(module, roles, systemPerms);
}
