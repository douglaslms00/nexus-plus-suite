import type { Database } from "./types";

type Tables = Database["public"]["Tables"];

export type Funcionario = Tables["funcionarios"]["Row"];
export type FuncionarioInsert = Tables["funcionarios"]["Insert"];
export type FuncionarioUpdate = Tables["funcionarios"]["Update"];

export type Obra = Tables["obras"]["Row"];
export type ObraInsert = Tables["obras"]["Insert"];
export type ObraUpdate = Tables["obras"]["Update"];

export type Ativo = Tables["ativos"]["Row"];
export type AtivoInsert = Tables["ativos"]["Insert"];
export type AtivoUpdate = Tables["ativos"]["Update"];

export type Ferramenta = Tables["ferramentas"]["Row"];
export type FerramentaInsert = Tables["ferramentas"]["Insert"];
export type FerramentaUpdate = Tables["ferramentas"]["Update"];

export type Material = Tables["materiais"]["Row"];
export type MaterialInsert = Tables["materiais"]["Insert"];
export type MaterialUpdate = Tables["materiais"]["Update"];

export type Epi = Tables["epis"]["Row"];
export type EpiInsert = Tables["epis"]["Insert"];
export type EpiUpdate = Tables["epis"]["Update"];

export type EpiMovimento = Tables["epi_movimentos"]["Row"];
export type EpiMovimentoInsert = Tables["epi_movimentos"]["Insert"];
export type EpiMovimentoUpdate = Tables["epi_movimentos"]["Update"];

export type Tarefa = Tables["tarefas"]["Row"];
export type TarefaInsert = Tables["tarefas"]["Insert"];
export type TarefaUpdate = Tables["tarefas"]["Update"];

export type TarefaExecucao = Tables["tarefa_execucoes"]["Row"];
export type TarefaExecucaoInsert = Tables["tarefa_execucoes"]["Insert"];
export type TarefaExecucaoUpdate = Tables["tarefa_execucoes"]["Update"];

export type ContaFinanceira = Tables["contas_financeiras"]["Row"];
export type ContaFinanceiraInsert = Tables["contas_financeiras"]["Insert"];
export type ContaFinanceiraUpdate = Tables["contas_financeiras"]["Update"];

export type Adiantamento = Tables["adiantamentos"]["Row"];
export type AdiantamentoInsert = Tables["adiantamentos"]["Insert"];
export type AdiantamentoUpdate = Tables["adiantamentos"]["Update"];

export type AdiantamentoDespesa = Tables["adiantamento_despesas"]["Row"];
export type AdiantamentoDespesaInsert = Tables["adiantamento_despesas"]["Insert"];
export type AdiantamentoDespesaUpdate = Tables["adiantamento_despesas"]["Update"];

export type AtivoEmprestimo = Tables["ativo_emprestimos"]["Row"];
export type AtivoEmprestimoInsert = Tables["ativo_emprestimos"]["Insert"];
export type AtivoEmprestimoUpdate = Tables["ativo_emprestimos"]["Update"];

export type AtivoManutencao = Tables["ativo_manutencoes"]["Row"];
export type AtivoManutencaoInsert = Tables["ativo_manutencoes"]["Insert"];
export type AtivoManutencaoUpdate = Tables["ativo_manutencoes"]["Update"];

export type UserRole = Tables["user_roles"]["Row"];
export type UserRoleInsert = Tables["user_roles"]["Insert"];
export type UserRoleUpdate = Tables["user_roles"]["Update"];

export type UserObra = Tables["user_obras"]["Row"];
export type UserObraInsert = Tables["user_obras"]["Insert"];
export type UserObraUpdate = Tables["user_obras"]["Update"];

export type UserModulePermission = Tables["user_module_permissions"]["Row"];
export type UserModulePermissionInsert = Tables["user_module_permissions"]["Insert"];
export type UserModulePermissionUpdate = Tables["user_module_permissions"]["Update"];

export type CustomRole = Tables["custom_roles"]["Row"];
export type CustomRoleInsert = Tables["custom_roles"]["Insert"];
export type CustomRoleUpdate = Tables["custom_roles"]["Update"];

export type CustomRoleModulePermission = Tables["custom_role_module_permissions"]["Row"];
export type CustomRoleModulePermissionInsert = Tables["custom_role_module_permissions"]["Insert"];
export type CustomRoleModulePermissionUpdate = Tables["custom_role_module_permissions"]["Update"];

export type SystemRoleModulePermission = Tables["system_role_module_permissions"]["Row"];
export type SystemRoleModulePermissionInsert = Tables["system_role_module_permissions"]["Insert"];
export type SystemRoleModulePermissionUpdate = Tables["system_role_module_permissions"]["Update"];

export type UserCustomRole = Tables["user_custom_roles"]["Row"];
export type UserCustomRoleInsert = Tables["user_custom_roles"]["Insert"];
export type UserCustomRoleUpdate = Tables["user_custom_roles"]["Update"];

export type Profile = Tables["profiles"]["Row"];
export type ProfileInsert = Tables["profiles"]["Insert"];
export type ProfileUpdate = Tables["profiles"]["Update"];

export type FuncionarioDocumento = Tables["funcionario_documentos"]["Row"];
export type FuncionarioDocumentoInsert = Tables["funcionario_documentos"]["Insert"];
export type FuncionarioDocumentoUpdate = Tables["funcionario_documentos"]["Update"];

export type FuncionarioTreinamento = Tables["funcionario_treinamentos"]["Row"];
export type FuncionarioTreinamentoInsert = Tables["funcionario_treinamentos"]["Insert"];
export type FuncionarioTreinamentoUpdate = Tables["funcionario_treinamentos"]["Update"];

export type Documento = Tables["documentos"]["Row"];
export type DocumentoInsert = Tables["documentos"]["Insert"];
export type DocumentoUpdate = Tables["documentos"]["Update"];

export type DocumentoPasta = Tables["documento_pastas"]["Row"];
export type DocumentoPastaInsert = Tables["documento_pastas"]["Insert"];
export type DocumentoPastaUpdate = Tables["documento_pastas"]["Update"];

export type PrestacaoConta = Tables["prestacao_contas"]["Row"];
export type PrestacaoContaInsert = Tables["prestacao_contas"]["Insert"];
export type PrestacaoContaUpdate = Tables["prestacao_contas"]["Update"];

export type Notificacao = Tables["notificacoes"]["Row"];
export type NotificacaoInsert = Tables["notificacoes"]["Insert"];
export type NotificacaoUpdate = Tables["notificacoes"]["Update"];
