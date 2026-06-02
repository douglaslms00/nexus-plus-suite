import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "gestor" | "colaborador" | "financeiro";

export function useCurrentUser() {
  return useQuery({
    queryKey: ["currentUser"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user;
    },
  });
}

export function useUserRoles() {
  const { data: user } = useCurrentUser();
  return useQuery({
    queryKey: ["userRoles", user?.id],
    enabled: !!user?.id,
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
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
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
