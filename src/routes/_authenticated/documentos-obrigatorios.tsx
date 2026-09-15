import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/documentos-obrigatorios")({
  beforeLoad: () => {
    throw redirect({ to: "/documentos", replace: true });
  },
  component: () => null,
});
