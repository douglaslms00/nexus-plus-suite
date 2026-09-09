import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

// Fallbacks não usam useRouter() de propósito: se o próprio router falhar ao
// ser criado, o contexto não existe e um segundo throw resultaria em tela branca
// sem nenhuma UI de erro.
function DefaultErrorFallback({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="max-w-md w-full text-center rounded-lg border bg-card p-6 shadow-sm">
        <div className="text-3xl mb-2">⚠️</div>
        <h2 className="text-lg font-semibold">Ops, algo deu errado</h2>
        <p className="mt-2 text-sm text-muted-foreground break-words">
          {error?.message ?? "Erro inesperado ao carregar esta tela."}
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              window.history.back();
            }}
            className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            Voltar
          </button>
          <button
            onClick={() => {
              reset();
              window.location.reload();
            }}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Tentar novamente
          </button>
          <a href="/" className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent">
            Início
          </a>
        </div>
      </div>
    </div>
  );
}

function DefaultNotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="max-w-md w-full text-center rounded-lg border bg-card p-6 shadow-sm">
        <h1 className="text-5xl font-bold">404</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          A página que você procura não existe ou foi movida.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => window.history.back()}
            className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            Voltar
          </button>
          <a
            href="/"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Ir para o início
          </a>
        </div>
      </div>
    </div>
  );
}

let browserQueryClient: QueryClient | undefined;

function getQueryClient() {
  if (typeof window === "undefined") {
    return new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 1000 * 60 * 2,
          gcTime: 1000 * 60 * 15,
          refetchOnWindowFocus: false,
          retry: 1,
        },
      },
    });
  }
  if (!browserQueryClient) {
    browserQueryClient = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 1000 * 60 * 2,
          gcTime: 1000 * 60 * 15,
          refetchOnWindowFocus: false,
          retry: 1,
        },
      },
    });
  }
  return browserQueryClient;
}

export const getRouter = () => {
  const queryClient = getQueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 1000 * 30, // 30s de preload
    defaultErrorComponent: DefaultErrorFallback,
    defaultNotFoundComponent: DefaultNotFound,
  });

  return router;
};
