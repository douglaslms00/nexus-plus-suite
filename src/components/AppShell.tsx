import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useProfile, useUserRoles, useMyModulePermissions, useMyCustomRoles, useAllCustomRolePerms, useAllSystemRolePerms, effectivePerm, useAuthorizedObras, canManage, type AppModule } from "@/lib/permissions";
import {
  LayoutDashboard, Users, CheckSquare, HardHat, Building2, LogOut,
  Boxes, Wrench, Package, Wallet, MapPin, ShieldCheck, Menu, X,
  PanelLeftClose, PanelLeftOpen, FolderOpen, UserCog, Receipt,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useEffect, useState, type ReactNode } from "react";
import { useObraAtual } from "@/lib/obra-context";
import { NotificationsBell } from "@/components/NotificationsBell";


export function AppShell({ children }: { children: ReactNode }) {
  const { location } = useRouterState();
  const navigate = useNavigate();
  const { data: profile } = useProfile();
  const { data: roles } = useUserRoles();
  const { data: overrides } = useMyModulePermissions();
  const { data: myCustomRoles } = useMyCustomRoles();
  const { data: customRolePerms } = useAllCustomRolePerms();
  const { data: systemRolePerms } = useAllSystemRolePerms();
  const { obraId, setObraId } = useObraAtual();
  const [open, setOpen] = useState(false); // mobile drawer
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("sidebar-collapsed") === "1";
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("sidebar-collapsed", collapsed ? "1" : "0");
    }
  }, [collapsed]);

  const { data: obras = [] } = useAuthorizedObras();
  const canSeeAllObras = canManage(roles);

  // Se a obra atual deixar de estar autorizada, limpa/ajusta a seleção.
  // Para usuários sem permissão de "todas", força a primeira obra autorizada.
  useEffect(() => {
    if (obras.length === 0) return;
    if (obraId && !obras.some((o) => o.id === obraId)) {
      setObraId(canSeeAllObras ? null : obras[0].id);
      return;
    }
    if (!obraId && !canSeeAllObras) {
      setObraId(obras[0].id);
    }
  }, [obras, obraId, setObraId, canSeeAllObras]);

  const logout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const items: { to: string; label: string; icon: any; module: AppModule }[] = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, module: "dashboard" },
    { to: "/funcionarios", label: "Funcionários", icon: Users, module: "funcionarios" },
    { to: "/tarefas", label: "Tarefas", icon: CheckSquare, module: "tarefas" },
    { to: "/obras", label: "Obras", icon: MapPin, module: "obras" },
    { to: "/ativos", label: "Ativos", icon: Boxes, module: "ativos" },
    { to: "/ferramentas", label: "Ferramentas", icon: Wrench, module: "ferramentas" },
    { to: "/materiais", label: "Materiais", icon: Package, module: "materiais" },
    { to: "/epis", label: "EPI / EPC", icon: HardHat, module: "epis" },
    { to: "/financeiro", label: "Financeiro", icon: Wallet, module: "financeiro" },
    { to: "/prestacao", label: "Prestação de contas", icon: Receipt, module: "prestacao" },
    { to: "/documentos", label: "Documentos", icon: FolderOpen, module: "documentos" },
    { to: "/acessos", label: "Acessos", icon: ShieldCheck, module: "acessos" },
  ];

  const nav = items.filter((it) => effectivePerm(it.module, roles, overrides, (myCustomRoles ?? []).map((c) => c.id), customRolePerms ?? [], systemRolePerms ?? []).can_view);

  const renderSidebar = (mini: boolean) => (
    <aside
      className={cn(
        "h-full bg-sidebar text-sidebar-foreground flex flex-col border-r border-sidebar-border transition-[width] duration-200",
        mini ? "w-16" : "w-64",
      )}
    >
      <div className={cn("flex items-center gap-3 border-b border-sidebar-border p-4", mini && "justify-center p-3")}>
        <div className="h-9 w-9 rounded-lg bg-sidebar-primary flex items-center justify-center shrink-0">
          <Building2 className="h-5 w-5 text-sidebar-primary-foreground" />
        </div>
        {!mini && (
          <div className="min-w-0 flex-1">
            <p className="font-semibold leading-tight truncate">GestãoPro</p>
            <p className="text-xs opacity-70 truncate">Gestão de Obra</p>
          </div>
        )}
        {!mini && (
          <button className="lg:hidden" onClick={() => setOpen(false)} aria-label="Fechar menu">
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <TooltipProvider delayDuration={0}>
        <nav className={cn("flex-1 space-y-1 overflow-y-auto", mini ? "p-2" : "p-3")}>
          {nav.map((item) => {
            const active = location.pathname.startsWith(item.to);
            const Icon = item.icon;
            const link = (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center rounded-md text-sm transition-colors",
                  mini ? "justify-center h-10 w-10 mx-auto" : "gap-3 px-3 py-2",
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
                aria-label={item.label}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!mini && <span className="truncate">{item.label}</span>}
              </Link>
            );
            return mini ? (
              <Tooltip key={item.to}>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            ) : (
              link
            );
          })}
        </nav>
      </TooltipProvider>

      <div className={cn("border-t border-sidebar-border space-y-3", mini ? "p-2" : "p-4")}>
        {!mini && (
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
        )}
        <Button
          variant="secondary"
          size={mini ? "icon" : "sm"}
          className={cn(mini ? "w-10 h-10 mx-auto" : "w-full")}
          onClick={logout}
          aria-label="Sair"
        >
          <LogOut className="h-4 w-4" />
          {!mini && <span className="ml-1">Sair</span>}
        </Button>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen flex bg-background">
      <div className="hidden lg:flex">{renderSidebar(collapsed)}</div>

      {open && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="relative z-10">{renderSidebar(false)}</div>
        </div>
      )}

      <main className="flex-1 overflow-auto flex flex-col">
        <header className="lg:hidden sticky top-0 z-30 bg-background/95 backdrop-blur border-b flex items-center justify-between px-3 py-2 gap-2">
          <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label="Abrir menu">
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex-1 max-w-[220px]">
            <Select value={obraId ?? "all"} onValueChange={(v) => setObraId(v === "all" ? null : v)}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Obra" /></SelectTrigger>
              <SelectContent>
                {canSeeAllObras && <SelectItem value="all">Todas as obras</SelectItem>}
                {obras.map((o: any) => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1">
            <NotificationsBell />
            <Button variant="ghost" size="icon" aria-label="Perfil" onClick={() => navigate({ to: "/perfil" })}>
              <UserCog className="h-5 w-5" />
            </Button>
          </div>
        </header>

        <div className="hidden lg:flex items-center justify-between px-6 lg:px-8 pt-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
            title={collapsed ? "Expandir menu" : "Recolher menu"}
          >
            {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
          </Button>
          <div className="flex items-center gap-3 text-sm">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Obra:</span>
            <Select value={obraId ?? "all"} onValueChange={(v) => setObraId(v === "all" ? null : v)}>
              <SelectTrigger className="h-9 w-[220px]"><SelectValue placeholder={canSeeAllObras ? "Todas as obras" : "Selecione a obra"} /></SelectTrigger>
              <SelectContent>
                {canSeeAllObras && <SelectItem value="all">Todas as obras</SelectItem>}
                {obras.map((o: any) => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            <NotificationsBell />
            <Button variant="ghost" size="icon" aria-label="Perfil" onClick={() => navigate({ to: "/perfil" })} title="Meu perfil">
              <UserCog className="h-5 w-5" />
            </Button>
          </div>
        </div>


        <div className="max-w-7xl mx-auto w-full p-4 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
