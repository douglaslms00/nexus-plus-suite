# Architecture rules
- Copilot uses an authenticated server function (requireSupabaseAuth) with the Lovable AI Gateway SDK, non-streaming for now; private model context never belongs in browser code.
- Copilot threads derive their identity from the URL and store UI messages per owner; validate ownership on every request to prevent cross-user history access.
- Copilot tools use the caller-scoped database client, check can_module before each operation, and persist pending mutations for explicit confirmation; model output never authorizes writes.
