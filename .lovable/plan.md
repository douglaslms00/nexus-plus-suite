
## 1. Notificações (sino + tempo real)

- Nova tabela `notifications` (user_id destinatário, tipo, título, mensagem, link, lida, ref_id, ref_table) com RLS própria por `user_id = auth.uid()`. Realtime habilitado.
- Componente `NotificationsBell` no header do `AppShell`: badge de não lidas, popover com lista, marcar como lida, "ver tudo".
- Hook `useNotifications` que assina `postgres_changes` em INSERT/UPDATE e invalida a query.
- Helper `notify(user_id, ...)` em SQL (SECURITY DEFINER) usado pelos triggers.

## 2. Tarefas atribuídas (aceitar/recusar)

- Acrescentar em `tarefas`: `assigned_to uuid`, `assignment_status` (`pendente|aceita|recusada|concluida`), `assignment_response_at`, `assignment_response_note`.
- Qualquer usuário com `can_edit` em tarefas pode atribuir a outro usuário da mesma obra.
- Triggers geram notificações:
  - Ao atribuir → notifica destinatário ("Nova tarefa atribuída").
  - Ao aceitar/recusar → notifica criador (`created_by`).
  - Ao concluir → notifica criador.
  - Job/verificação simples no frontend para tarefas atrasadas (sem cron): trigger ao salvar/update marca atraso e notifica.
- UI em `tarefas.tsx`: seletor de "Responsável", badge do status de atribuição, botões Aceitar/Recusar quando `auth.uid() = assigned_to` e status `pendente`.

## 3. Financeiro pessoal + obra (abas)

- Adicionar coluna `escopo` em `contas_financeiras` (`obra | pessoal`); RLS:
  - `pessoal`: somente o próprio `user_id` lê/edita.
  - `obra`: regras atuais (obra_id + `has_obra_access`).
- Reformular `financeiro.tsx` com `Tabs`: "Minhas finanças" (pessoal) e "Obra" (compartilhada). Cards de saldo separados por aba.
- Manter exportações CSV/PDF por aba.

## 4. Módulo Documentos

- Tabelas:
  - `documento_pastas` (id, nome, parent_id, escopo `obra|pessoal`, obra_id, user_id, created_by).
  - `documentos` (id, pasta_id, nome, storage_path, mime, tamanho, escopo, obra_id, user_id, created_by).
- Bucket `anexos` reaproveitado com prefixos `documentos/obra/<obra_id>/...` e `documentos/pessoal/<user_id>/...`. Políticas de storage por escopo.
- Nova rota `_authenticated/documentos.tsx`: árvore de pastas + tabela de arquivos, criar pasta, upload, download (signed url), excluir. Tabs "Obra" e "Minhas".
- Entrada no menu lateral com permissão própria de módulo `documentos`.

## 5. Cargos & Perfil

- **Cargos**: remover lista "duplicada" — manter uma só lista unificada (já é "Cargos"). Permitir editar `label`/`description` dos cargos de sistema (admin/gestor/financeiro/colaborador) em uma tabela nova `system_role_labels` (não muda o enum). UI usa o label dessa tabela quando existir.
- **Excluir usuário**: botão na linha do usuário em `acessos.tsx` chamando `admin_delete_user` (já existe), com confirmação.
- **Perfil do usuário**: nova rota `_authenticated/perfil.tsx` acessível a todos. Editar `nome`, `email` (via `supabase.auth.updateUser`), alterar senha, avatar opcional (upload em `anexos/avatars/<uid>`). Atalho no menu/avatar do header.

## 6. Realtime e infra

- `ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;`
- `useEffect` de subscribe no `NotificationsBell` (limpeza no unmount).

---

### Detalhes técnicos resumidos
- Migrations criadas com `CREATE TABLE` + `GRANT` + `ENABLE RLS` + políticas, conforme guidelines.
- Triggers `SECURITY DEFINER` para inserir notificações sem violar RLS.
- Nenhuma alteração nos arquivos auto-gerados do Supabase.
- Permissões respeitam `effectivePerm` existente; módulo `documentos` adicionado ao array de módulos em `seed_default_perms_for_role` e em `permissions.ts`.

### Arquivos a criar/editar
- Migração SQL única com notifications, tarefas (colunas+triggers), contas_financeiras (escopo+RLS), documentos (tabelas+políticas storage), system_role_labels, módulo documentos no seed.
- `src/components/NotificationsBell.tsx` (novo) e integração em `src/components/AppShell.tsx`.
- `src/routes/_authenticated/tarefas.tsx` (atribuição + aceitar/recusar).
- `src/routes/_authenticated/financeiro.tsx` (abas pessoal/obra).
- `src/routes/_authenticated/documentos.tsx` (novo).
- `src/routes/_authenticated/perfil.tsx` (novo).
- `src/routes/_authenticated/acessos.tsx` (excluir usuário + editar labels de cargos de sistema).
- `src/lib/permissions.ts` (módulo `documentos`).
