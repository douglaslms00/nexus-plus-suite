import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import {
  useProfile,
  useCurrentUser,
  useUserRoles,
  useMyModulePermissions,
  useMyCustomRoles,
  useAllCustomRolePerms,
  useAllSystemRolePerms,
  useSystemRoleLabels,
  resolveUserCargos,
  effectivePerm,
  useAuthorizedObras,
  canManage,
  type AppModule,
} from "@/lib/permissions";
import {
  LayoutDashboard,
  Users,
  CheckSquare,
  HardHat,
  Building2,
  LogOut,
  Boxes,
  Wrench,
  Package,
  Wallet,
  MapPin,
  ShieldCheck,
  Menu,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  FolderOpen,
  Receipt,
  Truck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useEffect, useState, type ReactNode } from "react";
import { useObraAtual } from "@/lib/obra-context.types";
import { NotificationsBell } from "@/components/NotificationsBell";
import { GlobalFloatingActions } from "@/components/GlobalFloatingActions";
import { InstallAppButton } from "@/components/InstallAppButton";

function UserHeaderProfile({
  profile,
  email,
  cargoLabel,
  cargoTitle,
  compact = false,
}: {
  profile?: { nome?: string | null; avatar_url?: string | null } | null;
  email?: string | null;
  cargoLabel?: string | null;
  cargoTitle?: string | null;
  compact?: boolean;
}) {
  const displayName = profile?.nome || "Usuário";
  const displayEmail = email || "";
  const initials = (profile?.nome || email || "U").slice(0, 2).toUpperCase();

  return (
    <Link
      to="/perfil"
      className={cn(
        "flex items-center rounded-full border border-border/60 bg-card/80 hover:bg-accent hover:border-border transition-all duration-150 group cursor-pointer shrink-0",
        compact
          ? "gap-1.5 p-1 pl-1 pr-2.5 max-w-[150px] sm:max-w-[220px]"
          : "gap-2.5 p-1 px-2.5 max-w-[240px] xl:max-w-[300px]",
      )}
      title={cargoTitle ?? (displayEmail ? `${displayName} — ${displayEmail}` : displayName)}
      aria-label={`Perfil de ${displayName}${cargoLabel ? `, cargo ${cargoLabel}` : ""}`}
    >
      <Avatar className={cn("shrink-0 ring-1 ring-border/50", compact ? "h-7 w-7" : "h-8 w-8")}>
        {profile?.avatar_url && <AvatarImage src={profile.avatar_url} alt={displayName} />}
        <AvatarFallback className="bg-primary/10 text-primary font-semibold text-xs">
          {initials}
        </AvatarFallback>
      </Avatar>
      <div className="flex flex-col min-w-0 text-left pr-0.5">
        <span
          className={cn(
            "font-semibold leading-tight truncate text-foreground group-hover:text-primary transition-colors",
            compact ? "text-xs" : "text-sm",
          )}
        >
          {displayName}
        </span>
        {cargoLabel ? (
          <span
            className={cn(
              "leading-tight truncate font-medium text-primary",
              compact ? "text-[9px]" : "text-[10px]",
            )}
            title={cargoTitle ?? cargoLabel}
          >
            {cargoLabel}
          </span>
        ) : null}
        {displayEmail && (
          <span
            className={cn(
              "leading-tight text-muted-foreground truncate",
              compact ? "text-[9px]" : "text-[10px]",
              cargoLabel && compact ? "hidden sm:block" : undefined,
            )}
          >
            {displayEmail}
          </span>
        )}
      </div>
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { location } = useRouterState();
  const navigate = useNavigate();
  const { data: profile } = useProfile();
  const { data: authUser } = useCurrentUser();
  const { data: roles } = useUserRoles();
  const { data: overrides } = useMyModulePermissions();
  const { data: myCustomRoles } = useMyCustomRoles();
  const { data: customRolePerms } = useAllCustomRolePerms();
  const { data: systemRolePerms } = useAllSystemRolePerms();
  const { data: systemLabels } = useSystemRoleLabels();
  const { obraId, setObraId } = useObraAtual();
  const [open, setOpen] = useState(false); // mobile drawer
  const [collapsed, setCollapsed] = useState(false);

  // Cargos do usuário para exibição no cabeçalho e no rodapé da sidebar.
  // Sistema primeiro (label amigável), depois personalizados.
  const userCargos = resolveUserCargos(roles, myCustomRoles, systemLabels);
  const primaryCargo = userCargos[0] ?? null;
  const cargosTitle =
    userCargos.length > 0 ? userCargos.map((c) => c.label).join(", ") : "Sem cargo";

  useEffect(() => {
    if (typeof window !== "undefined") {
      setCollapsed(window.localStorage.getItem("sidebar-collapsed") === "1");
    }
    // Garante que o perfil do usuário exista (para aparecer nas listas de usuários)
    void (supabase as any).rpc("ensure_profile");
  }, []);

  // Registra o login no histórico (1x por sessão). Falha silenciosa se a
  // tabela ainda não existir no banco (migration pendente) — nunca trava.
  useEffect(() => {
    const uid = authUser?.id;
    if (!uid || typeof window === "undefined") return;
    const flag = `login_recorded_${uid}`;
    if (window.sessionStorage.getItem(flag)) return;
    window.sessionStorage.setItem(flag, "1");
    void (async () => {
      try {
        const { error } = await (supabase as any).from("login_history").insert({
          user_id: uid,
          email: authUser?.email ?? null,
          user_agent: window.navigator.userAgent.slice(0, 300),
        });
        if (error) throw error;
      } catch (e: any) {
        const msg = String(e?.message ?? e);
        // Tabela ainda sem migration: apenas ignora (não trava o app).
        if (!/schema cache|does not exist|PGRST205|relation/i.test(msg)) {
          console.warn("[login_history] não registrado:", msg);
        }
        window.sessionStorage.removeItem(flag);
      }
    })();
  }, [authUser?.id, authUser?.email]);

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
    navigate({ to: "/auth", replace: true, search: { expired: undefined, reset: undefined } });
  };

  const items: {
    to: string;
    label: string;
    icon: any;
    module: AppModule;
    externalLink?: string;
  }[] = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, module: "dashboard" },
    { to: "/funcionarios", label: "Funcionários", icon: Users, module: "funcionarios" },
    { to: "/tarefas", label: "Tarefas", icon: CheckSquare, module: "tarefas" },
    { to: "/obras", label: "Obras", icon: MapPin, module: "obras" },
    { to: "/ativos", label: "Ativos", icon: Boxes, module: "ativos" },
    { to: "/ferramentas", label: "Ferramentas", icon: Wrench, module: "ferramentas" },
    { to: "/materiais", label: "Materiais", icon: Package, module: "materiais" },
    { to: "/epis", label: "EPI / EPC", icon: HardHat, module: "epis" },
    { to: "/financeiro", label: "Financeiro", icon: Wallet, module: "financeiro" },
    { to: "/frota", label: "Gestão de Frota", icon: Truck, module: "frota" },
    {
      to: "/prestacao",
      label: "Prestação de contas",
      icon: Receipt,
      module: "prestacao",
      externalLink: "https://prestacontasms.lovable.app/",
    },
    { to: "/documentos", label: "Documentos", icon: FolderOpen, module: "documentos" },
    { to: "/acessos", label: "Acessos", icon: ShieldCheck, module: "acessos" },
  ];

  const nav = items.filter(
    (it) =>
      effectivePerm(
        it.module,
        roles,
        overrides,
        (myCustomRoles ?? []).map((c) => c.id),
        customRolePerms ?? [],
        systemRolePerms ?? [],
      ).can_view,
  );

  const renderSidebar = (mini: boolean) => (
    <aside
      className={cn(
        "h-full bg-sidebar text-sidebar-foreground flex flex-col border-r border-sidebar-border transition-[width] duration-200",
        mini ? "w-16" : "w-64",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-3 border-b border-sidebar-border p-4",
          mini && "justify-center p-3",
        )}
      >
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

            const linkClass = cn(
              "flex items-center rounded-md text-sm transition-colors",
              mini ? "justify-center h-10 w-10 mx-auto" : "gap-3 px-3 py-2",
              active
                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            );

            const linkContent = (
              <>
                <Icon className="h-4 w-4 shrink-0" />
                {!mini && <span className="truncate">{item.label}</span>}
              </>
            );

            const link = item.externalLink ? (
              <a
                key={item.to}
                href={item.externalLink}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOpen(false)}
                className={linkClass}
                aria-label={item.label}
              >
                {linkContent}
              </a>
            ) : (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className={linkClass}
                aria-label={item.label}
              >
                {linkContent}
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
        {!mini ? (
          <div>
            <p className="text-sm font-medium truncate">{profile?.nome ?? "Usuário"}</p>
            <p className="text-xs font-medium text-primary truncate" title={cargosTitle}>
              {primaryCargo?.label ?? "Sem cargo"}
            </p>
            <p className="text-xs opacity-70 truncate">{authUser?.email}</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {userCargos.length > 0 ? (
                userCargos.map((c) => (
                  <span
                    key={c.key}
                    className="text-[10px] uppercase tracking-wide bg-sidebar-accent text-sidebar-accent-foreground px-2 py-0.5 rounded"
                    title={c.system ? "Cargo do sistema" : "Cargo personalizado"}
                  >
                    {c.label}
                  </span>
                ))
              ) : (
                <span className="text-[10px] uppercase tracking-wide bg-sidebar-accent text-sidebar-accent-foreground px-2 py-0.5 rounded">
                  Sem cargo
                </span>
              )}
            </div>
          </div>
        ) : (
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex justify-center">
                  <Avatar className="h-10 w-10 ring-1 ring-border/50">
                    {profile?.avatar_url && (
                      <AvatarImage
                        src={profile.avatar_url}
                        alt={profile?.nome ?? "Usuário"}
                      />
                    )}
                    <AvatarFallback className="bg-primary/10 text-primary font-semibold text-xs">
                      {(profile?.nome || authUser?.email || "U").slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </div>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p className="font-medium">{profile?.nome ?? "Usuário"}</p>
                <p className="text-xs text-primary font-medium">
                  {primaryCargo?.label ?? "Sem cargo"}
                </p>
                {authUser?.email && (
                  <p className="text-xs opacity-70">{authUser.email}</p>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
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
            <Select
              value={obraId ?? "all"}
              onValueChange={(v) => setObraId(v === "all" ? null : v)}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Obra" />
              </SelectTrigger>
              <SelectContent>
                {canSeeAllObras && <SelectItem value="all">Todas as obras</SelectItem>}
                {obras.map((o: any) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1.5">
            <InstallAppButton compact />
            <NotificationsBell />
            <UserHeaderProfile
              profile={profile}
              email={authUser?.email}
              cargoLabel={primaryCargo?.label}
              cargoTitle={cargosTitle}
              compact
            />
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
            {collapsed ? (
              <PanelLeftOpen className="h-5 w-5" />
            ) : (
              <PanelLeftClose className="h-5 w-5" />
            )}
          </Button>
          <div className="flex items-center gap-3 text-sm">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Obra:</span>
            <Select
              value={obraId ?? "all"}
              onValueChange={(v) => setObraId(v === "all" ? null : v)}
            >
              <SelectTrigger className="h-9 w-[220px]">
                <SelectValue placeholder={canSeeAllObras ? "Todas as obras" : "Selecione a obra"} />
              </SelectTrigger>
              <SelectContent>
                {canSeeAllObras && <SelectItem value="all">Todas as obras</SelectItem>}
                {obras.map((o: any) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <InstallAppButton />
            <NotificationsBell />
            <UserHeaderProfile
              profile={profile}
              email={authUser?.email}
              cargoLabel={primaryCargo?.label}
              cargoTitle={cargosTitle}
            />
          </div>
        </div>

        <div className="max-w-7xl mx-auto w-full p-4 lg:p-8">{children}</div>

        <GlobalFloatingActions />
      </main>
    </div>
  );
}
