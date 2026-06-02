import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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
  { key: "acessos", label: "Acessos" },
];

export function useCurrentUser() {
  return useQuery({
    queryKey: ["currentUser"],
    queryFn: async () => (await supabase.auth.getUser()).data.user,
  });
}

export function useUserRoles() {
  const { data: user } = useCurrentUser();
  return useQuery({
    queryKey: ["userRoles", user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<AppRole[]> => {
      const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", user!.id);
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
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", user!.id).maybeSingle();
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
export function isAdmin(roles?: AppRole[]) { return hasAny(roles, "admin"); }
export function canManage(roles?: AppRole[]) { return hasAny(roles, "admin", "gestor"); }
export function canFinance(roles?: AppRole[]) { return hasAny(roles, "admin", "gestor", "financeiro"); }

// Default permissions per role per module (used when no override exists)
function defaultPerm(module: AppModule, roles: AppRole[] | undefined): ModulePerm {
  const r = roles ?? [];
  if (r.includes("admin")) return { can_view: true, can_edit: true, can_delete: true };
  if (module === "acessos") return { can_view: false, can_edit: false, can_delete: false };
  if (r.includes("gestor")) return { can_view: true, can_edit: true, can_delete: false };
  if (r.includes("financeiro")) {
    if (module === "financeiro") return { can_view: true, can_edit: true, can_delete: false };
    return { can_view: true, can_edit: false, can_delete: false };
  }
  // colaborador
  const baseView: AppModule[] = ["dashboard", "tarefas", "funcionarios", "epis"];
  return { can_view: baseView.includes(module), can_edit: false, can_delete: false };
}

export function useModulePerm(module: AppModule): ModulePerm {
  const { data: roles } = useUserRoles();
  const { data: overrides } = useMyModulePermissions();
  const o = overrides?.find((x) => x.module === module);
  if (o) return { can_view: o.can_view, can_edit: o.can_edit, can_delete: o.can_delete };
  return defaultPerm(module, roles);
}

export function effectivePerm(
  module: AppModule,
  roles: AppRole[] | undefined,
  overrides: ({ module: AppModule } & ModulePerm)[] | undefined,
): ModulePerm {
  const o = overrides?.find((x) => x.module === module);
  if (o) return { can_view: o.can_view, can_edit: o.can_edit, can_delete: o.can_delete };
  return defaultPerm(module, roles);
}
