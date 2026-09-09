#!/usr/bin/env node
// Copia dados do projeto antigo (rcxqcubmcneqwyigezgb) para o novo (yrkdbrkijpwilhptmqii) via REST
// Usa publishable antigo para leitura (anon) e secret novo para escrita (bypass RLS via service_role)
// Execute: node scripts/copy-supabase-data.mjs
// Requer que NEW_PROJECT_SCHEMA.sql ja tenha sido executado no novo projeto

const OLD_URL = process.env.OLD_SUPABASE_URL || "https://rcxqcubmcneqwyigezgb.supabase.co";
const OLD_KEY = process.env.OLD_SUPABASE_PUBLISHABLE_KEY || "YOUR_OLD_PUBLISHABLE_KEY";
const NEW_URL = process.env.SUPABASE_URL || "https://yrkdbrkijpwilhptmqii.supabase.co";
const NEW_PUB = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "YOUR_NEW_PUBLISHABLE_KEY";
const NEW_SECRET = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "YOUR_NEW_SECRET_KEY";

// Ordem respeitando FKs (pais antes dos filhos)
const TABLES_IN_ORDER = [
  "obras",
  "profiles",
  "funcionarios",
  "epis",
  "materiais",
  "ferramentas",
  "ativos",
  "tarefas",
  "contas_financeiras",
  "adiantamentos",
  // filhos
  "adiantamento_despesas",
  "ativo_emprestimos",
  "ativo_manutencoes",
  "ativo_transferencias",
  "epi_movimentos",
  "material_movimentos",
  "ferramenta_emprestimos",
  "funcionario_documentos",
  "funcionario_treinamentos",
  "obra_vencimentos",
  "documento_pastas",
  "documentos",
  "tarefa_execucoes",
  "notifications",
  "user_roles",
  "user_obras",
  "custom_roles",
  "custom_role_module_permissions",
  "user_custom_roles",
  "user_module_permissions",
  "system_role_labels",
  "system_role_module_permissions",
  "permission_audit_log",
];

async function fetchAll(table) {
  const rows = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const url = `${OLD_URL}/rest/v1/${table}?select=*&order=created_at.asc&offset=${from}&limit=${pageSize}`;
    // tenta com paginacao via Range header alternativa
    const res = await fetch(url, { headers: { apikey: OLD_KEY, Authorization: `Bearer ${OLD_KEY}` } });
    const text = await res.text();
    if (!res.ok) {
      if (res.status === 401 || res.status === 404) {
        // sem acesso ou tabela nao existe no antigo (pode ser PGRST205)
        console.log(`  [${table}] skip fetch ${res.status}: ${text.slice(0,120)}`);
        return null;
      }
      throw new Error(`fetch ${table} failed ${res.status}: ${text}`);
    }
    let data;
    try { data = JSON.parse(text); } catch { data = []; }
    if (!Array.isArray(data) || data.length === 0) break;
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

async function insertBatch(table, rows) {
  if (!rows || rows.length === 0) return;
  // insere em batches de 100 para evitar payload grande
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    const res = await fetch(`${NEW_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: {
        apikey: NEW_SECRET,
        Authorization: `Bearer ${NEW_SECRET}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(batch),
    });
    const txt = await res.text();
    if (!res.ok) {
      console.error(`  [${table}] insert batch ${i} failed ${res.status}: ${txt.slice(0,500)}`);
      // tenta linha a linha para identificar conflito
      if (res.status === 409) {
        console.log(`  [${table}] conflito de PK, tentando upsert linha a linha...`);
        for (const row of batch) {
          const r2 = await fetch(`${NEW_URL}/rest/v1/${table}`, {
            method: "POST",
            headers: { apikey: NEW_SECRET, Authorization: `Bearer ${NEW_SECRET}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
            body: JSON.stringify(row),
          });
          if (!r2.ok) console.error(`    row ${row.id || "?"} err ${r2.status} ${(await r2.text()).slice(0,200)}`);
        }
      }
    } else {
      console.log(`  [${table}] +${batch.length} inseridos (${i+batch.length}/${rows.length})`);
    }
  }
}

async function main() {
  console.log(`OLD: ${OLD_URL}`);
  console.log(`NEW: ${NEW_URL}`);
  console.log("Iniciando copia via REST. Isso so copia o que anon consegue ler no antigo (RLS pode limitar).");
  console.log("Para copia 100% fiel use pg_dump com DATABASE_URL.\n");
  for (const table of TABLES_IN_ORDER) {
    console.log(`\n=== ${table} ===`);
    try {
      const rows = await fetchAll(table);
      if (rows === null) { console.log(`  pulado`); continue; }
      console.log(`  lidos ${rows.length} do antigo`);
      if (rows.length > 0) await insertBatch(table, rows);
      else console.log(`  vazio`);
    } catch (e) {
      console.error(`  erro ${table}:`, e.message);
    }
  }
  console.log("\nConcluido. Verifique no Dashboard > Table Editor se os dados apareceram.");
}

main();
