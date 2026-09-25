// Rotina TTL 48h — alternativa Node.js ao Edge Function.
// Uso: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/purge-arquivos-48h.mjs
// Cron sugerido (a cada 15 min): */15 * * * * node scripts/purge-arquivos-48h.mjs
//
// O que faz:
//  1. Chama a função SQL purgar_arquivos_expirados() (marca status='excluido', expira_em <= now()).
//  2. Remove os binários do bucket `anexos` via service_role.
//  3. O acesso lógico já expira exatamente em 48h (checagem de expira_em no backend),
//     mesmo que o purge físico rode minutos depois.

import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = "anexos";

if (!URL || !KEY) {
  console.error("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(URL, KEY, { auth: { persistSession: false } });

async function main() {
  const { data, error } = await supabase.rpc("purgar_arquivos_expirados");
  if (error) throw new Error(`rpc purgar_arquivos_expirados falhou: ${error.message}`);
  const lista = data ?? [];
  if (lista.length === 0) {
    console.log("[purge-48h] Nada a purgar");
    return;
  }
  console.log(`[purge-48h] Marcados como excluídos: ${lista.length}`);
  const paths = lista.map((a) => a.storage_path);
  const { error: stErr } = await supabase.storage.from(BUCKET).remove(paths);
  if (stErr) throw new Error(`storage.remove falhou: ${stErr.message}`);
  console.log(`[purge-48h] Binários removidos do bucket ${BUCKET}: ${paths.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
