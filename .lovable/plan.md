## Objetivo
Trocar o catálogo de Materiais (atualmente em grid de cards) por uma tabela no mesmo estilo do catálogo de EPI/EPC.

## Mudanças (apenas em `src/routes/_authenticated/materiais.tsx`)
- Adicionar import de `Table, TableBody, TableCell, TableHead, TableHeader, TableRow` de `@/components/ui/table` e `cn` de `@/lib/utils`.
- Substituir o bloco `<div className="grid gap-3 md:grid-cols-...">{materiais.map(...)}</div>` da aba "Catálogo" por uma `<Card>` contendo uma `<Table>` com colunas:
  - Nome (font-medium)
  - Código
  - Unidade
  - Estoque atual (em vermelho/negrito quando abaixo do mínimo, com ícone de alerta inline)
  - Estoque mínimo
  - Preço médio
  - Ações (Editar / Excluir, alinhadas à direita, respeitando `canCreate` / `canDelete`)
- Linha de estado vazio: `<TableRow><TableCell colSpan={7}>Nenhum material cadastrado.</TableCell></TableRow>`.
- Manter o botão "Novo material" e o Dialog de edição inalterados acima da tabela.

Nada mais é alterado (abas Movimentos e Relatórios, queries, mutações e permissões permanecem como estão).
