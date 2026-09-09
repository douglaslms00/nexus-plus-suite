import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

function isAbortError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? "");
  return msg.includes("aborted") || msg.includes("abortIncoming") || msg.includes("ECONNRESET");
}

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    if (isAbortError(error)) {
      console.warn(
        "[ssr] abort in requestMiddleware, ignoring:",
        (error as Error)?.message ?? error,
      );
      return new Response(null, { status: 409 });
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [errorMiddleware],
}));
