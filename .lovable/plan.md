## 1. Tornar todos os cargos editáveis (inclusive os do sistema)

**Banco**
- Nova tabela `system_role_module_permissions(role app_role, module text, can_view, can_edit, can_delete)` com seed inicial copiando o que hoje é hardcoded em `effectivePerm` (admin = tudo; gestor = view+edit menos acessos; etc.).
- Novo RPC `admin_set_system_role_perm(_role, _module, _can_view, _can_edit, _can_delete)` (security definer, só admin).
- Já existe `admin_set_system_role_label` — será usado para editar rótulo/descrição.
- RLS: leitura para `authenticated`, escrita só via RPC.

**Frontend (`src/routes/_authenticated/acessos.tsx`)**
- `SystemRoleCard` passa a se comportar como `CustomRoleCard`:
  - Remover o badge "Não editável".
  - Botão "Editar" para alterar rótulo + descrição (chama `admin_set_system_role_label`).
  - Checkboxes da matriz ficam habilitados e chamam `admin_set_system_role_perm`.
  - Bloquear apenas a coluna `acessos` quando o cargo for `admin` (admin sempre mantém acesso a Acessos) para evitar lockout — único guarda-corpo.
- `effectivePerm` passa a ler de `system_role_module_permissions` (carregado via query) em vez dos defaults hardcoded.

## 2. Notificações em tempo real — endurecimento

**Banco**
- Confirmar/recriar política `notifications_select` como `USING (user_id = auth.uid())` (sem fallback para gestor/admin), `notifications_update` e `notifications_delete` idem. INSERT continua só via `notify_user` (security definer).
- Garantir que `notifications` está na publicação `supabase_realtime` apenas com `REPLICA IDENTITY DEFAULT` (não FULL) para não vazar colunas antigas.
- Realtime respeita RLS de SELECT → o filtro `user_id=eq.${user.id}` no canal já é redundante mas mantido como defesa em profundidade.

**Frontend (`src/components/NotificationsBell.tsx`)**
- Resetar o cache de notificações no `SIGNED_OUT` (limpar `["notifications"]`) para não exibir notificações do usuário anterior se outra conta logar na mesma aba.
- Confirmar que o canal é recriado quando `user.id` muda (já é, pelo dep `user?.id`).
- Adicionar guard: se `payload.new.user_id !== user.id`, ignorar (defesa extra caso a RLS seja afrouxada por engano).

## 3. Tarefas — visibilidade pós-aceite + edição antes do aceite

**Banco**
- Atualizar política `tarefas_select_own_or_gestor` para incluir `assigned_to = auth.uid()` no `USING`, garantindo que o destinatário sempre veja a tarefa.
- Política `tarefas_update_owner_or_gestor`: permitir que o `assigned_to` atualize **somente** os campos de resposta (aceita/recusa). Manter edição completa para `created_by`, responsável e gestor/admin.

**Frontend (`src/routes/_authenticated/tarefas.tsx`)**
- Na criação com `assigned_to`: deixar `responsavel_id = null` até o aceite. Ao aceitar, `responsavel_id` passa a ser o `assigned_to` (já acontece). Ao recusar, fica como estava.
- Ajustar filtro `onlyMine` para incluir `assigned_to === user.id` (mostra para o destinatário enquanto está pendente e depois do aceite).
- Botão "Editar" na tarefa quando `created_by === user.id` E `assignment_status === 'pendente'` (ou sem destinatário ainda):
  - Abre Dialog reaproveitando o form de criação (título, descrição, prioridade, vencimento, destinatário).
  - Salva via `update` em `tarefas`. Se trocar o destinatário, reseta `assignment_status = 'pendente'` e `assignment_response_*` → trigger `tarefas_notify` já dispara nova notificação para o novo destinatário.
- Após o aceite, badge "Aceita" + a tarefa aparece normalmente para criador (via `created_by`) e destinatário (via `assigned_to`/`responsavel_id`).

## Arquivos tocados
- `supabase/migrations/<nova>.sql` (tabela perms de sistema, RPC, ajuste RLS de tarefas e notifications)
- `src/routes/_authenticated/acessos.tsx`
- `src/routes/_authenticated/tarefas.tsx`
- `src/components/NotificationsBell.tsx`
