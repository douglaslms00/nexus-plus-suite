// Supabase Edge Function: purga arquivos P2P expirados (TTL 48h).
// Deploy: supabase functions deploy purge-arquivos
// Agende via pg_cron / dashboard (a cada 15 min) chamando esta function.
// Requer SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (service_role faz bypass do RLS).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BUCKET = "anexos";
const BATCH = 200;

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return Response.json({ error: "Use POST" }, { status: 405 });
  }
  // Autorização simples: exige o service_role ou um segredo compartilhado.
  // O Dashboard/Cron deve enviar Authorization: Bearer <SERVICE_ROLE ou CRON_SECRET>.
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) {
    return Response.json({ error: "Não autorizado" }, { status: 401 });
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // 1. Marca expirados como excluídos (função SQL é atômica + SKIP LOCKED).
  const { data: expirados, error } = await sb.rpc("purgar_arquivos_expirados");
  if (error) {
    console.error("[purge-arquivos] rpc falhou:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
  const lista = (expirados ?? []) as { arquivo_id: string; storage_path: string; solicitacao_id: string }[];
  if (lista.length === 0) return Response.json({ purged: 0 });

  // 2. Remove binários do Storage (fora da transação SQL).
  let removidos = 0;
  const falhas: string[] = [];
  // Remove em lote por bucket (limite da API).
  const paths = lista.map((a) => a.storage_path);
  for (let i = 0; i < paths.length; i += BATCH) {
    const chunk = paths.slice(i, i + BATCH);
    const { error: stErr } = await sb.storage.from(BUCKET).remove(chunk);
    if (stErr) {
      console.error("[purge-arquivos] storage.remove falhou:", stErr.message);
      falhas.push(...chunk);
    } else {
      removidos += chunk.length;
    }
  }

  return Response.json({ purged: lista.length, storage_removed: removidos, failures: falhas });
});
