import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const MODULES = [
  "dashboard",
  "funcionarios",
  "tarefas",
  "obras",
  "ativos",
  "ferramentas",
  "materiais",
  "epis",
  "financeiro",
  "prestacao",
  "documentos",
  "frota",
  "acessos",
] as const;

const ACTIONS = ["view", "edit", "delete", "import"] as const;
type Action = (typeof ACTIONS)[number];
type PermissionRow = {
  module: string;
  can_view: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_import?: boolean;
};

function permits(row: PermissionRow | undefined, action: Action): boolean {
  if (!row) return false;
  if (action === "view") return !!row.can_view;
  if (action === "edit") return !!row.can_edit;
  if (action === "delete") return !!row.can_delete;
  return typeof row.can_import === "boolean" ? row.can_import : !!row.can_edit;
}

function fallbackPermission(module: string, roles: string[], action: Action): boolean {
  if (roles.includes("admin")) return true;
  if (module === "acessos") return false;
  if (roles.includes("gestor")) return action === "view" || action === "edit";
  if (roles.includes("financeiro")) {
    if (action === "view") return true;
    return module === "financeiro" && action === "edit";
  }
  if (action === "view") {
    return ["dashboard", "tarefas", "funcionarios", "epis", "documentos", "prestacao"].includes(module);
  }
  return module === "prestacao" && action === "edit";
}

/** Resolve permissões do usuário autenticado no servidor, usando o mesmo
 * precedence order da aplicação: override > cargo personalizado > cargo do sistema. */
export async function getCopilotAccessContext(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<{ roleLabel: string; permissions: string[] }> {
  const [roleResult, overrideResult, customLinkResult] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", userId),
    supabase
      .from("user_module_permissions")
      .select("module, can_view, can_edit, can_delete, can_import")
      .eq("user_id", userId),
    supabase.from("user_custom_roles").select("custom_role_id").eq("user_id", userId),
  ]);
  if (roleResult.error) throw roleResult.error;
  if (overrideResult.error) throw overrideResult.error;
  if (customLinkResult.error) throw customLinkResult.error;

  const roles = (roleResult.data ?? []).map((r) => String(r.role));
  const customRoleIds = (customLinkResult.data ?? []).map((r) => r.custom_role_id);
  const [customRoleResult, customPermissionResult, systemPermissionResult, systemLabelResult] =
    await Promise.all([
      customRoleIds.length
        ? (supabase as any).from("custom_roles").select("id, label").in("id", customRoleIds)
        : Promise.resolve({ data: [], error: null }),
      customRoleIds.length
        ? supabase
            .from("custom_role_module_permissions")
            .select("custom_role_id, module, can_view, can_edit, can_delete, can_import")
            .in("custom_role_id", customRoleIds)
        : Promise.resolve({ data: [], error: null }),
      roles.length
        ? supabase
            .from("system_role_module_permissions")
            .select("role, module, can_view, can_edit, can_delete, can_import")
            .in("role", roles as never)
        : Promise.resolve({ data: [], error: null }),
      roles.length
        ? supabase.from("system_role_labels").select("role, label").in("role", roles as never)
        : Promise.resolve({ data: [], error: null }),
    ]);
  for (const result of [customRoleResult, customPermissionResult, systemPermissionResult, systemLabelResult]) {
    if (result.error) throw result.error;
  }

  const customRoles = (customRoleResult.data ?? []) as { id: string; label: string | null }[];
  const roleLabel =
    customRoles[0]?.label?.trim() ||
    (systemLabelResult.data ?? []).map((r: { role: string; label: string }) => r.label).find(Boolean) ||
    roles[0] ||
    "Sem cargo";
  const overrides = (overrideResult.data ?? []) as PermissionRow[];
  const customPermissions = (customPermissionResult.data ?? []) as (PermissionRow & {
    custom_role_id: string;
  })[];
  const systemPermissions = (systemPermissionResult.data ?? []) as (PermissionRow & { role: string })[];

  const permissions: string[] = [];
  for (const module of MODULES) {
    for (const action of ACTIONS) {
      let allowed: boolean;
      if (roles.includes("admin")) {
        allowed = true;
      } else {
        const override = overrides.find((row) => row.module === module);
        const customMatches = customPermissions.filter(
          (row) => customRoleIds.includes(row.custom_role_id) && row.module === module,
        );
        const systemMatches = systemPermissions.filter(
          (row) => roles.includes(row.role) && row.module === module,
        );
        if (override) allowed = permits(override, action);
        else if (customMatches.length) allowed = customMatches.some((row) => permits(row, action));
        else if (systemMatches.length) allowed = systemMatches.some((row) => permits(row, action));
        else allowed = fallbackPermission(module, roles, action);
      }
      if (allowed) permissions.push(`${module}:${action}`);
    }
  }
  return { roleLabel, permissions };
}
