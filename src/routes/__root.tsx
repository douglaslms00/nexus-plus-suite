import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { supabase } from "@/integrations/supabase/client";
import { Toaster } from "@/components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Página não encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">A página que você procura não existe.</p>
        <div className="mt-6">
          <Link to="/" className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            Voltar ao início
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "root" });
  }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">Algo deu errado</h1>
        <p className="mt-2 text-sm text-muted-foreground">Um erro inesperado ocorreu. Tente novamente mais tarde.</p>
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="mt-6 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Tentar novamente
        </button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  ssr: false,
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "GestãoPro — Sistema de Gestão" },
      { name: "description", content: "Plataforma de gestão de obra: funcionários, tarefas, EPIs, ativos e financeiro." },
      { name: "theme-color", content: "#1e40af" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "#1e40af" },
      { name: "apple-mobile-web-app-title", content: "GestãoPro" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "og:title", content:"GestãoPro — Sistema de Gestão" },
      { name: "og:description", content:"Plataforma de gestão de obra: funcionários, tarefas, EPIs, ativos e financeiro." },
      { property: "og:image", content:"https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/f56deb1b-9e21-4a1e-85be-e5cc855f7e79/id-preview-959f7836--6e37b413-08a0-4e4a-986e-292ccd010856.lovable.app-1780436427244.png" },
      { name: "twitter:title", content:"GestãoPro — Sistema de Gestão" },
      { name: "twitter:description", content:"Plataforma de gestão de obra: funcionários, tarefas, EPIs, ativos e financeiro." },
      { name: "twitter:card", content:"summary_large_image" },
      { property: "og:type", content:"website" },
      { name: "manifest", content:"/manifest.json" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head><HeadContent /></head>
      <body>{children}<Scripts /></body>
    </html>
  );
}

function AuthListener() {
  const router = useRouter();
  const queryClient = useQueryClient();
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      router.invalidate();
      queryClient.invalidateQueries();
    });
    return () => subscription.unsubscribe();
  }, [router, queryClient]);
  return null;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js");
    }
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <AuthListener />
      <Outlet />
      <Toaster richColors position="top-right" />
    </QueryClientProvider>
  );
}