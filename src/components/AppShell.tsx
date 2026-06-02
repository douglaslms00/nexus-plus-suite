import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useProfile, useUserRoles, canFinance, isAdmin } from "@/lib/permissions";
import {
  LayoutDashboard, Users, CheckSquare, HardHat, Building2, LogOut,
  Boxes, Wrench, Package, Wallet, MapPin, ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function AppShell({ children }: { children: ReactNode }) {
  const { location } = useRouterState();
  const navigate = useNavigate();
  const { data: profile } = useProfile();
  const { data: roles } = useUserRoles();

  const logout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const nav: { to: string; label: string; icon: any; show: boolean }[] = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, show: true },
    { to: "/funcionarios", label: "Funcionários", icon: Users, show: true },
    { to: "/tarefas", label: "Tarefas", icon: CheckSquare, show: true },
    { to: "/obras", label: "Obras", icon: MapPin, show: true },
    { to: "/ativos", label: "Ativos", icon: Boxes, show: true },
    { to: "/ferramentas", label: "Ferramentas", icon: Wrench, show: true },
    { to: "/materiais", label: "Materiais", icon: Package, show: true },
    { to: "/epis", label: "EPI / EPC", icon: HardHat, show: true },
    { to: "/financeiro", label: "Financeiro", icon: Wallet, show: canFinance(roles) || true },
    { to: "/acessos", label: "Acessos", icon: ShieldCheck, show: isAdmin(roles) },
  ];

  return (
    <div className="min-h-screen flex bg-background">
      <aside className="w-64 bg-sidebar text-sidebar-foreground flex flex-col border-r border-sidebar-border">
        <div className="p-6 flex items-center gap-3 border-b border-sidebar-border">
          <div className="h-10 w-10 rounded-lg bg-sidebar-primary flex items-center justify-center">
            <Building2 className="h-5 w-5 text-sidebar-primary-foreground" />
          </div>
          <div>
            <p className="font-semibold leading-tight">GestãoPro</p>
            <p className="text-xs opacity-70">Gestão de Obra</p>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {nav.filter((n) => n.show).map((item) => {
            const active = location.pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-sidebar-border space-y-3">
          <div>
            <p className="text-sm font-medium truncate">{profile?.nome ?? "Usuário"}</p>
            <p className="text-xs opacity-70 truncate">{profile?.email}</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {(roles ?? []).map((r) => (
                <span key={r} className="text-[10px] uppercase tracking-wide bg-sidebar-accent text-sidebar-accent-foreground px-2 py-0.5 rounded">
                  {r}
                </span>
              ))}
            </div>
          </div>
          <Button variant="secondary" size="sm" className="w-full" onClick={logout}>
            <LogOut className="h-4 w-4" /> Sair
          </Button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
