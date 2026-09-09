#!/usr/bin/env node
// Migra tudo do Supabase próprio (antigo) para o Lovable Cloud (novo).
//
// PRÉ-REQUISITOS no projeto NOVO (Lovable Cloud):
//   1. Rodar NEW_PROJECT_SCHEMA.sql no SQL Editor
//   2. Rodar scripts/lovable-extra.sql no SQL Editor (policies do storage)
//   3. Desligar "Confirm email" em Authentication > Providers > Email
//
// USO (rode na pasta do projeto):
//   node scripts/migrate-to-lovable.mjs [tables|storage|users|all]
//   O destino vem das envs NEW_SUPABASE_URL e NEW_SUPABASE_SECRET_KEY.
//   Ex. (Windows PowerShell):
//     $env:NEW_SUPABASE_URL="https://xxx.lovable.app"  # URL do novo projeto
//     $env:NEW_SUPABASE_SECRET_KEY="sb_secret_..."
//     node scripts/migrate-to-lovable.mjs all
//
// A origem (projeto atual) é lida do .env (SUPABASE_URL + SECRET/SERVICE_ROLE).
// Senhas NÃO migram (hash inacessível): cada usuário recebe e-mail de
// redefinição para criar a senha no novo projeto.

import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

function loadDotEnv(path = ".env") {
  const out = {};
  try {
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"?([^"]*)"?\s*$/);
      if (m) out[m[1]] = m[2];
    }
  } catch {
    /* sem .env — usa só process.env */
  }
  return out;
}

const dot = loadDotEnv();
const env = (k, fb = "") => process.env[k] ?? dot[k] ?? fb;

const OLD_URL = env("SUPABASE_URL");
const OLD_SECRET = env("SUPABASE_SECRET_KEY") || env("SUPABASE_SERVICE_ROLE_KEY");
const NEW_URL = (process.env.NEW_SUPABASE_URL || "").replace(/\/$/, "");
const NEW_SECRET = process.env.NEW_SUPABASE_SECRET_KEY || "";

if (!OLD_URL || !OLD_SECRET) {
  console.error("Faltam SUPABASE_URL / SUPABASE_SECRET_KEY no .env (origem).");
  process.exit(1);
}
if (!NEW_URL || !NEW_SECRET || NEW_SECRET.includes("YOUR_")) {
  console.error("Defina NEW_SUPABASE_URL e NEW_SUPABASE_SECRET_KEY antes de rodar.");
  process.exit(1);
}

const oldH = (extra = {}) => ({
  apikey: OLD_SECRET,
  Authorization: `Bearer ${OLD_SECRET}`,
  ...extra,
});
const newH = (extra = {}) => ({
  apikey: NEW_SECRET,
  Authorization: `Bearer ${NEW_SECRET}`,
  ...extra,
});

// Ordem respeitando FKs (pais antes dos filhos)
const TABLES_IN_ORDER = [
  "obras",
  "profiles",
  "funcionarios",
  "frota_veiculos",
  "frota_motoristas",
  "epis",
  "materiais",
  "ferramentas",
  "ativos",
  "tarefas",
  "contas_financeiras",
  "adiantamentos",
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
  "frota_abastecimentos",
  "frota_manutencoes",
  "frota_gastos_avulsos",
  "frota_pedagios",
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
  // order=id acelera e estabiliza; cai para sem-ordem se a tabela não tiver id
  let orderParam = "&order=id.asc";
  while (true) {
    let url = `${OLD_URL}/rest/v1/${table}?select=*${orderParam}&offset=${from}&limit=${pageSize}`;
    let res = await fetch(url, { headers: oldH() });
    if (!res.ok && orderParam && res.status === 400) {
      orderParam = "";
      url = `${OLD_URL}/rest/v1/${table}?select=*&offset=${from}&limit=${pageSize}`;
      res = await fetch(url, { headers: oldH() });
    }
    const text = await res.text();
    if (!res.ok) throw new Error(`fetch ${table} ${res.status}: ${text.slice(0, 200)}`);
    const data = JSON.parse(text);
    if (!Array.isArray(data) || data.length === 0) break;
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

async function upsertBatch(table, rows) {
  let ok = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    const res = await fetch(`${NEW_URL}/rest/v1/${table}?on_conflict=id`, {
      method: "POST",
      headers: newH({
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      }),
      body: JSON.stringify(batch),
    });
    if (!res.ok) {
      console.error(`  [${table}] lote ${i} falhou ${res.status}: ${(await res.text()).slice(0, 300)}`);
    } else {
      ok += batch.length;
    }
  }
  return ok;
}

async function phaseTables() {
  let total = 0;
  for (const table of TABLES_IN_ORDER) {
    try {
      const rows = await fetchAll(table);
      if (rows.length === 0) {
        console.log(`[${table}] vazia no antigo — ok`);
        continue;
      }
      const ok = await upsertBatch(table, rows);
      total += ok;
      console.log(`[${table}] ${ok}/${rows.length} migradas`);
    } catch (e) {
      console.error(`[${table}] ERRO: ${e.message}`);
    }
  }
  console.log(`\nTabelas: ${total} linhas migradas no total.`);
}

async function listStorage(prefix = "", acc = []) {
  let offset = 0;
  const limit = 100;
  while (true) {
    const res = await fetch(`${OLD_URL}/storage/v1/object/list/anexos`, {
      method: "POST",
      headers: oldH({ "Content-Type": "application/json" }),
      body: JSON.stringify({ prefix, limit, offset }),
    });
    if (!res.ok) throw new Error(`list storage ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const items = await res.json();
    if (!Array.isArray(items) || items.length === 0) break;
    for (const it of items) {
      const path = prefix ? `${prefix}/${it.name}` : it.name;
      if (it.id == null && !it.metadata) {
        await listStorage(path, acc); // pasta
      } else {
        acc.push(path);
      }
    }
    if (items.length < limit) break;
    offset += limit;
  }
  return acc;
}

async function phaseStorage() {
  const files = await listStorage();
  console.log(`[storage] ${files.length} arquivos no bucket anexos`);
  let ok = 0;
  for (const path of files) {
    try {
      const dl = await fetch(`${OLD_URL}/storage/v1/object/anexos/${path}`, { headers: oldH() });
      if (!dl.ok) throw new Error(`download ${dl.status}`);
      const buf = Buffer.from(await dl.arrayBuffer());
      const ctype = dl.headers.get("content-type") || "application/octet-stream";
      const up = await fetch(`${NEW_URL}/storage/v1/object/anexos/${path}`, {
        method: "POST",
        headers: newH({ "Content-Type": ctype, "x-upsert": "true" }),
        body: buf,
      });
      if (!up.ok) throw new Error(`upload ${up.status}: ${(await up.text()).slice(0, 200)}`);
      ok++;
      if (ok % 20 === 0) console.log(`[storage] ${ok}/${files.length}...`);
    } catch (e) {
      console.error(`[storage] ${path} ERRO: ${e.message}`);
    }
  }
  console.log(`[storage] ${ok}/${files.length} arquivos migrados.`);
}

async function phaseUsers() {
  // 1. lista usuários do antigo
  const all = [];
  let page = 1;
  while (true) {
    const res = await fetch(`${OLD_URL}/auth/v1/admin/users?per_page=100&page=${page}`, {
      headers: oldH(),
    });
    if (!res.ok) throw new Error(`list users ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    const users = data.users ?? [];
    all.push(...users);
    if (users.length < 100) break;
    page++;
  }
  console.log(`[users] ${all.length} usuários no antigo`);
  // 2. recria no novo (senha aleatória desconhecida) + envia e-mail de redefinição
  for (const u of all) {
    if (!u.email) {
      console.log(`[users] pulado sem e-mail: ${u.id}`);
      continue;
    }
    try {
      const crt = await fetch(`${NEW_URL}/auth/v1/admin/users`, {
        method: "POST",
        headers: newH({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          email: u.email,
          email_confirm: true,
          password: randomUUID() + randomUUID(),
          user_metadata: { ...(u.user_metadata || {}), migrado_de: "supabase-proprio" },
        }),
      });
      const ctxt = await crt.text();
      if (!crt.ok && !ctxt.includes("already been registered") && !ctxt.includes("already exists")) {
        throw new Error(`create ${crt.status}: ${ctxt.slice(0, 200)}`);
      }
      const rec = await fetch(`${NEW_URL}/auth/v1/recover`, {
        method: "POST",
        headers: newH({ "Content-Type": "application/json" }),
        body: JSON.stringify({ email: u.email }),
      });
      if (!rec.ok) throw new Error(`recover ${rec.status}: ${(await rec.text()).slice(0, 200)}`);
      console.log(`[users] ${u.email} recriado + e-mail de redefinição enviado`);
    } catch (e) {
      console.error(`[users] ${u.email} ERRO: ${e.message}`);
    }
  }
  console.log("[users] concluído. Cada pessoa define a nova senha pelo link recebido.");
}

const phase = process.argv[2] || "all";
console.log(`OLD (origem): ${OLD_URL}`);
console.log(`NEW (destino): ${NEW_URL}\n`);
if (phase === "tables" || phase === "all") await phaseTables();
if (phase === "storage" || phase === "all") await phaseStorage();
if (phase === "users" || phase === "all") await phaseUsers();
console.log("\nMigração concluída. Confira no novo dashboard (Table Editor + Storage + Users).");
