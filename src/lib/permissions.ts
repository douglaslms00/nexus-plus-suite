import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isMissingSchemaError } from "@/lib/supabase-safe";

export type AppRole = "admin" | "gestor" | "colaborador" | "financeiro";

// Labels amigáveis dos cargos do sistema (mesmos usados em Acessos).
// Podem ser sobrescritos pelos valores da tabela `system_role_labels`.
export const SYSTEM_ROLE_LABELS: Record<AppRole, string> = {
  admin: "Administrador",
  gestor: "Gestor",
  financeiro: "Financeiro",
  colaborador: "Colaborador",
};

export type SystemRoleLabel = {
  role: AppRole;
  label: string;
  description: string | null;
};

export function useSystemRoleLabels() {
  return useQuery({
    queryKey: ["system-role-labels"],
    staleTime: 1000 * 60 * 5,
    retry: 1,
    queryFn: async (): Promise<SystemRoleLabel[]> => {
      const { data, error } = await supabase
        .from("system_role_labels")
        .select("role, label, description");
      if (error) {
        if (isMissingSchemaError(error)) {
          console.warn("[useSystemRoleLabels] indisponível, usando padrão:", error.message);
          return [];
        }
        throw error;
      }
      return (data ?? []) as SystemRoleLabel[];
    },
  });
}

/** Label amigável de um cargo do sistema, respeitando `system_role_labels`. */
export function getSystemRoleLabel(
  role: AppRole,
  overrides?: SystemRoleLabel[] | null,
): string {
  const found = (overrides ?? []).find((l) => l.role === role);
  const label = found?.label?.trim();
  if (label) return label;
  return SYSTEM_ROLE_LABELS[role] ?? role;
}

export type ResolvedCargo = {
  key: string;
  label: string;
  system: boolean;
};

/**
 * Resolve a lista de cargos do usuário para exibição (cabeçalho / sidebar).
 * - Cargos do sistema primeiro (com label amigável), depois personalizados.
 * - Deduplicado por `key`.
 */
export function resolveUserCargos(
  roles: AppRole[] | undefined | null,
  customRoles: Pick<CustomRole, "id" | "label">[] | undefined | null,
  systemLabels?: SystemRoleLabel[] | null,
): ResolvedCargo[] {
  const out: ResolvedCargo[] = [];
  const seen = new Set<string>();
  for (const r of roles ?? []) {
    const key = `sys:${r}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ key, label: getSystemRoleLabel(r, systemLabels), system: true });
  }
  for (const c of customRoles ?? []) {
    if (!c?.id) continue;
    const key = `cus:${c.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const label = (c.label ?? "").trim() || "Personalizado";
    out.push({ key, label, system: false });
  }
  return out;
}

/** Cargo principal (primeiro da lista) para exibição compacta no cabeçalho. */
export function resolvePrimaryCargo(
  roles: AppRole[] | undefined | null,
  customRoles: Pick<CustomRole, "id" | "label">[] | undefined | null,
  systemLabels?: SystemRoleLabel[] | null,
): ResolvedCargo | null {
  return resolveUserCargos(roles, customRoles, systemLabels)[0] ?? null;
}

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
  | "frota"
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
  { key: "frota", label: "Gestão de Frota" },
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
    retry: 1,
    queryFn: async (): Promise<AppRole[]> => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user!.id);
      if (error) {
        // Tabela ainda sem RLS/migration no banco remoto: trata como "sem cargos"
        // para mostrar a tela de espera em vez de travar o AppShell.
        if (isMissingSchemaError(error)) {
          console.warn("[useUserRoles] user_roles indisponível, retornando []:", error.message);
          return [];
        }
        throw error;
      }
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
    retry: 1,
    queryFn: async () => {
      // Tenta com cpf; se o banco remoto ainda não tem a coluna
      // (migration 20260909120000 pendente -> 400/42703), cai para sem cpf
      // em vez de quebrar todas as telas com erro 400.
      const withCpf = await supabase
        .from("profiles")
        .select("id, nome, setor, avatar_url, cpf, created_at, updated_at")
        .eq("id", user!.id)
        .maybeSingle();
      if (!withCpf.error) return withCpf.data;
      const code = (withCpf.error as any)?.code ?? "";
      const msg = (withCpf.error as any)?.message ?? "";
      const missingCpf =
        code === "42703" || code === "PGRST204" || (/cpf/i.test(msg) && /column|exist|find/i.test(msg));
      if (!missingCpf) throw withCpf.error;
      console.warn(
        "[useProfile] coluna profiles.cpf ausente no banco. Aplique a migration 20260909120000_login_cpf_email.sql no Supabase.",
      );
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

export type ModulePerm = {
  can_view: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_import: boolean;
};

/**
 * Normaliza uma linha de permissão vinda do banco.
 * Antes da migration 20260928 a coluna `can_import` não existe: nesse caso
 * herda `can_edit` para não quebrar quem já importava (transição).
 * Após a migration, vale o valor explícito (padrão false = opt-in).
 */
export function normalizeModulePerm(row: {
  can_view: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_import?: boolean;
}): ModulePerm {
  return {
    can_view: !!row.can_view,
    can_edit: !!row.can_edit,
    can_delete: !!row.can_delete,
    can_import:
      typeof row.can_import === "boolean" ? row.can_import : !!row.can_edit,
  };
}

function isMissingCanImportColumn(error: unknown): boolean {
  const msg = String((error as { message?: string })?.message ?? error ?? "");
  return (
    (error as { code?: string })?.code === "PGRST204" &&
    /can_import/i.test(msg)
  );
}

export function useMyModulePermissions() {
  const { data: user } = useCurrentUser();
  return useQuery({
    queryKey: ["my-module-perms", user?.id],
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 5,
    retry: 1,
    queryFn: async () => {
      const withImport = await supabase
        .from("user_module_permissions")
        .select("module, can_view, can_edit, can_delete, can_import")
        .eq("user_id", user!.id);
      if (!withImport.error) {
        return ((withImport.data ?? []) as ({ module: AppModule } & ModulePerm)[]).map(
          (r: any) => ({ module: r.module as AppModule, ...normalizeModulePerm(r) }),
        );
      }
      if (isMissingSchemaError(withImport.error) && !isMissingCanImportColumn(withImport.error)) {
        console.warn("[useMyModulePermissions] indisponível, retornando []:", withImport.error.message);
        return [];
      }
      // Coluna can_import ainda não existe no banco: busca sem ela e herda can_edit.
      const legacy = await supabase
        .from("user_module_permissions")
        .select("module, can_view, can_edit, can_delete")
        .eq("user_id", user!.id);
      if (legacy.error) {
        if (isMissingSchemaError(legacy.error)) {
          console.warn("[useMyModulePermissions] indisponível, retornando []:", legacy.error.message);
          return [];
        }
        throw legacy.error;
      }
      return ((legacy.data ?? []) as any[]).map((r: any) => ({
        module: r.module as AppModule,
        ...normalizeModulePerm(r),
      }));
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
    retry: 1,
    queryFn: async (): Promise<{ id: string; nome: string }[]> => {
      try {
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
      } catch (e) {
        if (isMissingSchemaError(e)) {
          console.warn("[useAuthorizedObras] indisponível, retornando []:", (e as Error)?.message);
          return [];
        }
        throw e;
      }
    },
  });
}

export type SystemRolePerm = { role: AppRole; module: AppModule } & ModulePerm;

export function useAllSystemRolePerms() {
  return useQuery({
    queryKey: ["all-system-role-perms"],
    staleTime: 1000 * 60 * 5,
    retry: 1,
    queryFn: async (): Promise<SystemRolePerm[]> => {
      const withImport = await supabase
        .from("system_role_module_permissions")
        .select("role, module, can_view, can_edit, can_delete, can_import");
      if (!withImport.error) {
        return ((withImport.data ?? []) as any[]).map((r: any) => ({
          role: r.role,
          module: r.module,
          ...normalizeModulePerm(r),
        })) as SystemRolePerm[];
      }
      if (isMissingSchemaError(withImport.error) && !isMissingCanImportColumn(withImport.error)) {
        console.warn("[useAllSystemRolePerms] indisponível, usando fallback:", withImport.error.message);
        return [];
      }
      const legacy = await supabase
        .from("system_role_module_permissions")
        .select("role, module, can_view, can_edit, can_delete");
      if (legacy.error) {
        if (isMissingSchemaError(legacy.error)) {
          console.warn("[useAllSystemRolePerms] indisponível, usando fallback:", legacy.error.message);
          return [];
        }
        throw legacy.error;
      }
      return ((legacy.data ?? []) as any[]).map((r: any) => ({
        role: r.role,
        module: r.module,
        ...normalizeModulePerm(r),
      })) as SystemRolePerm[];
    },
  });
}

function fallbackPerm(module: AppModule, roles: AppRole[] | undefined): ModulePerm {
  const r = roles ?? [];
  if (r.includes("admin")) return { can_view: true, can_edit: true, can_delete: true, can_import: true };
  if (module === "acessos") return { can_view: false, can_edit: false, can_delete: false, can_import: false };
  if (r.includes("gestor")) return { can_view: true, can_edit: true, can_delete: false, can_import: false };
  if (r.includes("financeiro")) {
    if (module === "financeiro") return { can_view: true, can_edit: true, can_delete: false, can_import: false };
    return { can_view: true, can_edit: false, can_delete: false, can_import: false };
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
    can_import: false,
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
  if (r.includes("admin")) return { can_view: true, can_edit: true, can_delete: true, can_import: true };
  const matches = systemPerms.filter((p) => p.module === module && r.includes(p.role));
  if (!matches.length) return fallbackPerm(module, r);
  return {
    can_view: matches.some((m) => m.can_view),
    can_edit: matches.some((m) => m.can_edit),
    can_delete: matches.some((m) => m.can_delete),
    can_import: matches.some((m) => normalizeModulePerm(m).can_import),
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
    retry: 1,
    // Em 2 passos (sem embed `custom_role:custom_roles`): o embed quebra com
    // PGRST200 quando o FK tem outro nome/está ausente no schema remoto, o que
    // fazia cargos personalizados nunca aparecerem para o próprio usuário.
    queryFn: async (): Promise<CustomRole[]> => {
      const { data: links, error: linkError } = await supabase
        .from("user_custom_roles")
        .select("custom_role_id")
        .eq("user_id", user!.id);
      if (linkError) {
        if (isMissingSchemaError(linkError)) {
          console.warn("[useMyCustomRoles] indisponível, retornando []:", linkError.message);
          return [];
        }
        throw linkError;
      }
      const ids = [...new Set((links ?? []).map((r: any) => r.custom_role_id).filter(Boolean))];
      if (ids.length === 0) return [];
      const { data, error } = await (supabase as any)
        .from("custom_roles")
        .select("id, name, label, description, parent_role_id, template_role")
        .in("id", ids);
      if (error) {
        if (isMissingSchemaError(error)) {
          console.warn("[useMyCustomRoles] custom_roles indisponível, retornando []:", error.message);
          return [];
        }
        throw error;
      }
      return (data ?? []) as CustomRole[];
    },
  });
}

export function useAllCustomRolePerms() {
  const { data: user } = useCurrentUser();
  return useQuery({
    queryKey: ["all-custom-role-perms", user?.id],
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 5,
    retry: 1,
    queryFn: async (): Promise<CustomRolePerm[]> => {
      const full = await supabase
        .from("custom_role_module_permissions")
        .select("custom_role_id, module, can_view, can_edit, can_delete, can_import");
      if (!full.error) {
        return ((full.data ?? []) as any[]).map((r: any) => ({
          custom_role_id: r.custom_role_id,
          module: r.module,
          ...normalizeModulePerm(r),
        })) as CustomRolePerm[];
      }
      if (!isMissingSchemaError(full.error) || isMissingCanImportColumn(full.error)) {
        // Coluna can_import ainda não existe: tenta leitura legada e herda can_edit.
        try {
          const legacy = await supabase
            .from("custom_role_module_permissions")
            .select("custom_role_id, module, can_view, can_edit, can_delete");
          if (!legacy.error) {
            return ((legacy.data ?? []) as any[]).map((r: any) => ({
              custom_role_id: r.custom_role_id,
              module: r.module,
              ...normalizeModulePerm(r),
            })) as CustomRolePerm[];
          }
          if (isMissingSchemaError(legacy.error)) {
            console.warn("[useAllCustomRolePerms] indisponível, retornando []:", legacy.error.message);
            return [];
          }
        } catch {
          // cai no fluxo abaixo
        }
      } else if (isMissingSchemaError(full.error)) {
        console.warn("[useAllCustomRolePerms] indisponível, retornando []:", full.error.message);
        return [];
      }
      // Leitura da tabela cheia negada (RLS para não-admins): tenta escopo
      // restrito às permissões dos próprios cargos do usuário.
      try {
        const { data: links, error: linkError } = await supabase
          .from("user_custom_roles")
          .select("custom_role_id")
          .eq("user_id", user!.id);
        if (linkError) throw linkError;
        const ids = [...new Set((links ?? []).map((r: any) => r.custom_role_id).filter(Boolean))];
        if (ids.length === 0) return [];
        const scoped = await supabase
          .from("custom_role_module_permissions")
          .select("custom_role_id, module, can_view, can_edit, can_delete, can_import")
          .in("custom_role_id", ids);
        if (!scoped.error) {
          return ((scoped.data ?? []) as any[]).map((r: any) => ({
            custom_role_id: r.custom_role_id,
            module: r.module,
            ...normalizeModulePerm(r),
          })) as CustomRolePerm[];
        }
        if (isMissingCanImportColumn(scoped.error)) {
          const legacyScoped = await supabase
            .from("custom_role_module_permissions")
            .select("custom_role_id, module, can_view, can_edit, can_delete")
            .in("custom_role_id", ids);
          if (legacyScoped.error) throw legacyScoped.error;
          return ((legacyScoped.data ?? []) as any[]).map((r: any) => ({
            custom_role_id: r.custom_role_id,
            module: r.module,
            ...normalizeModulePerm(r),
          })) as CustomRolePerm[];
        }
        throw scoped.error;
      } catch (e) {
        if (isMissingSchemaError(e)) {
          console.warn("[useAllCustomRolePerms] indisponível, retornando []:", (e as Error)?.message);
          return [];
        }
        console.warn(
          "[useAllCustomRolePerms] sem acesso às permissões custom (RLS?), cargos personalizados ignorados:",
          (e as { message?: string })?.message ?? e,
        );
        return [];
      }
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
    can_import: matches.some((m) => normalizeModulePerm(m).can_import),
  };
}

const DENY_ALL: ModulePerm = { can_view: false, can_edit: false, can_delete: false, can_import: false };

/** `true` enquanto qualquer fonte de permissão ainda está carregando. */
export function usePermissionsLoading(): boolean {
  const { isLoading: a } = useUserRoles();
  const { isLoading: b } = useMyModulePermissions();
  const { isLoading: c } = useMyCustomRoles();
  const { isLoading: d } = useAllCustomRolePerms();
  const { isLoading: e } = useAllSystemRolePerms();
  return a || b || c || d || e;
}

export function useModulePerm(module: AppModule): ModulePerm {
  const { data: roles, isLoading: rolesLoading } = useUserRoles();
  const { data: overrides, isLoading: overridesLoading } = useMyModulePermissions();
  const { data: customRoles, isLoading: customRolesLoading } = useMyCustomRoles();
  const { data: customPerms, isLoading: customPermsLoading } = useAllCustomRolePerms();
  const { data: systemPerms, isLoading: systemPermsLoading } = useAllSystemRolePerms();

  if (roles?.includes("admin")) return { can_view: true, can_edit: true, can_delete: true, can_import: true };

  const o = (overrides ?? []).find((x) => x.module === module);
  if (o) return normalizeModulePerm(o as any);

  const fromCustom = mergeCustomPerms(
    module,
    (customRoles ?? []).map((c) => c.id),
    customPerms ?? [],
  );
  if (fromCustom) return fromCustom;

  // Nega por padrão SOMENTE enquanto as permissões ainda estão carregando
  // (evita flash de dados sem permissão no dashboard). Após resolver — mesmo
  // com erro em alguma query (RLS/tabela ausente) — degrada para as listas
  // disponíveis (`?? []`) em vez de negar para sempre, senão cargos
  // personalizados seriam ignorados quando uma leitura auxiliar falhasse.
  if (rolesLoading || overridesLoading || customRolesLoading || customPermsLoading || systemPermsLoading) {
    return DENY_ALL;
  }
  return defaultPerm(module, roles ?? [], systemPerms ?? []);
}

export function effectivePerm(
  module: AppModule,
  roles: AppRole[] | undefined,
  overrides: ({ module: AppModule } & ModulePerm)[] | undefined,
  customRoleIds: string[] = [],
  customPerms: CustomRolePerm[] = [],
  systemPerms: SystemRolePerm[] = [],
): ModulePerm {
  if (roles?.includes("admin")) return { can_view: true, can_edit: true, can_delete: true, can_import: true };
  const o = overrides?.find((x) => x.module === module);
  if (o) return normalizeModulePerm(o as any);
  const fromCustom = mergeCustomPerms(module, customRoleIds, customPerms);
  if (fromCustom) return fromCustom;
  return defaultPerm(module, roles, systemPerms);
}
