import { QueryClient } from "@tanstack/react-query";
import { createRouter, useRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

function DefaultErrorFallback({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="max-w-md w-full text-center rounded-lg border bg-card p-6 shadow-sm">
        <div className="text-3xl mb-2">⚠️</div>
        <h2 className="text-lg font-semibold">Ops, algo deu errado</h2>
        <p className="mt-2 text-sm text-muted-foreground break-words">
          {error?.message ?? "Erro inesperado ao carregar esta tela."}
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <button
            onClick={() => { router.invalidate(); reset(); }}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Tentar novamente
          </button>
          <a
            href="/"
            className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            Ir para o início
          </a>
        </div>
      </div>
    </div>
  );
}

function DefaultNotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-5xl font-bold">404</h1>
        <p className="mt-2 text-sm text-muted-foreground">Página não encontrada.</p>
        <a href="/" className="mt-5 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">Voltar ao início</a>
      </div>
    </div>
  );
}

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: DefaultErrorFallback,
    defaultNotFoundComponent: DefaultNotFound,
  });

  return router;
};
