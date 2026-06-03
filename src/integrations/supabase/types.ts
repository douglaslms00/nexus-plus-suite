export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ativo_emprestimos: {
        Row: {
          anexo_url: string | null
          ativo_id: string
          created_at: string
          created_by: string | null
          data_devolucao: string | null
          data_emprestimo: string
          funcionario_id: string | null
          id: string
          observacoes: string | null
          prevista_devolucao: string | null
        }
        Insert: {
          anexo_url?: string | null
          ativo_id: string
          created_at?: string
          created_by?: string | null
          data_devolucao?: string | null
          data_emprestimo?: string
          funcionario_id?: string | null
          id?: string
          observacoes?: string | null
          prevista_devolucao?: string | null
        }
        Update: {
          anexo_url?: string | null
          ativo_id?: string
          created_at?: string
          created_by?: string | null
          data_devolucao?: string | null
          data_emprestimo?: string
          funcionario_id?: string | null
          id?: string
          observacoes?: string | null
          prevista_devolucao?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ativo_emprestimos_ativo_id_fkey"
            columns: ["ativo_id"]
            isOneToOne: false
            referencedRelation: "ativos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ativo_emprestimos_funcionario_id_fkey"
            columns: ["funcionario_id"]
            isOneToOne: false
            referencedRelation: "funcionarios"
            referencedColumns: ["id"]
          },
        ]
      }
      ativo_manutencoes: {
        Row: {
          ativo_id: string
          created_at: string
          created_by: string | null
          custo: number | null
          data: string
          descricao: string | null
          id: string
          proxima_em: string | null
          tipo: string
        }
        Insert: {
          ativo_id: string
          created_at?: string
          created_by?: string | null
          custo?: number | null
          data?: string
          descricao?: string | null
          id?: string
          proxima_em?: string | null
          tipo?: string
        }
        Update: {
          ativo_id?: string
          created_at?: string
          created_by?: string | null
          custo?: number | null
          data?: string
          descricao?: string | null
          id?: string
          proxima_em?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "ativo_manutencoes_ativo_id_fkey"
            columns: ["ativo_id"]
            isOneToOne: false
            referencedRelation: "ativos"
            referencedColumns: ["id"]
          },
        ]
      }
      ativo_transferencias: {
        Row: {
          aprovado_por: string | null
          ativo_id: string
          created_at: string
          decidido_em: string | null
          id: string
          motivo: string | null
          obra_destino_id: string
          obra_origem_id: string | null
          solicitado_por: string | null
          status: string
        }
        Insert: {
          aprovado_por?: string | null
          ativo_id: string
          created_at?: string
          decidido_em?: string | null
          id?: string
          motivo?: string | null
          obra_destino_id: string
          obra_origem_id?: string | null
          solicitado_por?: string | null
          status?: string
        }
        Update: {
          aprovado_por?: string | null
          ativo_id?: string
          created_at?: string
          decidido_em?: string | null
          id?: string
          motivo?: string | null
          obra_destino_id?: string
          obra_origem_id?: string | null
          solicitado_por?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ativo_transferencias_ativo_id_fkey"
            columns: ["ativo_id"]
            isOneToOne: false
            referencedRelation: "ativos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ativo_transferencias_obra_destino_id_fkey"
            columns: ["obra_destino_id"]
            isOneToOne: false
            referencedRelation: "obras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ativo_transferencias_obra_origem_id_fkey"
            columns: ["obra_origem_id"]
            isOneToOne: false
            referencedRelation: "obras"
            referencedColumns: ["id"]
          },
        ]
      }
      ativos: {
        Row: {
          categoria: string | null
          codigo: string | null
          created_at: string
          data_aquisicao: string | null
          descricao: string | null
          estado: string
          id: string
          nome: string
          obra_id: string | null
          updated_at: string
          valor: number | null
        }
        Insert: {
          categoria?: string | null
          codigo?: string | null
          created_at?: string
          data_aquisicao?: string | null
          descricao?: string | null
          estado?: string
          id?: string
          nome: string
          obra_id?: string | null
          updated_at?: string
          valor?: number | null
        }
        Update: {
          categoria?: string | null
          codigo?: string | null
          created_at?: string
          data_aquisicao?: string | null
          descricao?: string | null
          estado?: string
          id?: string
          nome?: string
          obra_id?: string | null
          updated_at?: string
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ativos_obra_id_fkey"
            columns: ["obra_id"]
            isOneToOne: false
            referencedRelation: "obras"
            referencedColumns: ["id"]
          },
        ]
      }
      contas_financeiras: {
        Row: {
          categoria: string | null
          comprovante_url: string | null
          created_at: string
          created_by: string | null
          data_pagamento: string | null
          data_vencimento: string
          descricao: string
          id: string
          obra_id: string | null
          observacoes: string | null
          status: string
          tipo: string
          updated_at: string
          user_id: string | null
          valor: number
        }
        Insert: {
          categoria?: string | null
          comprovante_url?: string | null
          created_at?: string
          created_by?: string | null
          data_pagamento?: string | null
          data_vencimento: string
          descricao: string
          id?: string
          obra_id?: string | null
          observacoes?: string | null
          status?: string
          tipo: string
          updated_at?: string
          user_id?: string | null
          valor: number
        }
        Update: {
          categoria?: string | null
          comprovante_url?: string | null
          created_at?: string
          created_by?: string | null
          data_pagamento?: string | null
          data_vencimento?: string
          descricao?: string
          id?: string
          obra_id?: string | null
          observacoes?: string | null
          status?: string
          tipo?: string
          updated_at?: string
          user_id?: string | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "contas_financeiras_obra_id_fkey"
            columns: ["obra_id"]
            isOneToOne: false
            referencedRelation: "obras"
            referencedColumns: ["id"]
          },
        ]
      }
      epi_movimentos: {
        Row: {
          created_at: string
          created_by: string | null
          data_movimento: string
          data_vencimento: string | null
          epi_id: string
          funcionario_id: string | null
          id: string
          motivo_retirada: string | null
          observacoes: string | null
          quantidade: number
          tipo: Database["public"]["Enums"]["epi_movimento_tipo"]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data_movimento?: string
          data_vencimento?: string | null
          epi_id: string
          funcionario_id?: string | null
          id?: string
          motivo_retirada?: string | null
          observacoes?: string | null
          quantidade?: number
          tipo: Database["public"]["Enums"]["epi_movimento_tipo"]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data_movimento?: string
          data_vencimento?: string | null
          epi_id?: string
          funcionario_id?: string | null
          id?: string
          motivo_retirada?: string | null
          observacoes?: string | null
          quantidade?: number
          tipo?: Database["public"]["Enums"]["epi_movimento_tipo"]
        }
        Relationships: [
          {
            foreignKeyName: "epi_movimentos_epi_id_fkey"
            columns: ["epi_id"]
            isOneToOne: false
            referencedRelation: "epis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "epi_movimentos_funcionario_id_fkey"
            columns: ["funcionario_id"]
            isOneToOne: false
            referencedRelation: "funcionarios"
            referencedColumns: ["id"]
          },
        ]
      }
      epis: {
        Row: {
          ativo: boolean
          ca: string | null
          created_at: string
          descricao: string | null
          estoque_atual: number
          estoque_minimo: number
          id: string
          nome: string
          tipo: string
          updated_at: string
          validade_meses: number | null
        }
        Insert: {
          ativo?: boolean
          ca?: string | null
          created_at?: string
          descricao?: string | null
          estoque_atual?: number
          estoque_minimo?: number
          id?: string
          nome: string
          tipo?: string
          updated_at?: string
          validade_meses?: number | null
        }
        Update: {
          ativo?: boolean
          ca?: string | null
          created_at?: string
          descricao?: string | null
          estoque_atual?: number
          estoque_minimo?: number
          id?: string
          nome?: string
          tipo?: string
          updated_at?: string
          validade_meses?: number | null
        }
        Relationships: []
      }
      ferramenta_emprestimos: {
        Row: {
          anexo_url: string | null
          created_at: string
          created_by: string | null
          data_devolucao: string | null
          data_emprestimo: string
          ferramenta_id: string
          funcionario_id: string | null
          id: string
          observacoes: string | null
          prevista_devolucao: string | null
        }
        Insert: {
          anexo_url?: string | null
          created_at?: string
          created_by?: string | null
          data_devolucao?: string | null
          data_emprestimo?: string
          ferramenta_id: string
          funcionario_id?: string | null
          id?: string
          observacoes?: string | null
          prevista_devolucao?: string | null
        }
        Update: {
          anexo_url?: string | null
          created_at?: string
          created_by?: string | null
          data_devolucao?: string | null
          data_emprestimo?: string
          ferramenta_id?: string
          funcionario_id?: string | null
          id?: string
          observacoes?: string | null
          prevista_devolucao?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ferramenta_emprestimos_ferramenta_id_fkey"
            columns: ["ferramenta_id"]
            isOneToOne: false
            referencedRelation: "ferramentas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ferramenta_emprestimos_funcionario_id_fkey"
            columns: ["funcionario_id"]
            isOneToOne: false
            referencedRelation: "funcionarios"
            referencedColumns: ["id"]
          },
        ]
      }
      ferramentas: {
        Row: {
          codigo: string | null
          created_at: string
          descricao: string | null
          estado: string
          id: string
          nome: string
          obra_id: string | null
          proxima_manutencao: string | null
          updated_at: string
        }
        Insert: {
          codigo?: string | null
          created_at?: string
          descricao?: string | null
          estado?: string
          id?: string
          nome: string
          obra_id?: string | null
          proxima_manutencao?: string | null
          updated_at?: string
        }
        Update: {
          codigo?: string | null
          created_at?: string
          descricao?: string | null
          estado?: string
          id?: string
          nome?: string
          obra_id?: string | null
          proxima_manutencao?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ferramentas_obra_id_fkey"
            columns: ["obra_id"]
            isOneToOne: false
            referencedRelation: "obras"
            referencedColumns: ["id"]
          },
        ]
      }
      funcionarios: {
        Row: {
          ativo: boolean
          cpf: string | null
          created_at: string
          created_by: string | null
          data_admissao: string | null
          email: string | null
          experiencia_concluida: boolean
          funcao: string | null
          id: string
          nome: string
          obra_id: string | null
          observacoes: string | null
          setor: string | null
          telefone: string | null
          updated_at: string
          validade_meses_aso: number | null
          validade_meses_ferias: number | null
          validade_meses_ficha_epi: number | null
          validade_meses_folga_campo: number | null
          vencimento_aso: string | null
          vencimento_ferias: string | null
          vencimento_ficha_epi: string | null
          vencimento_folga_campo: string | null
          vencimento_treinamento: string | null
        }
        Insert: {
          ativo?: boolean
          cpf?: string | null
          created_at?: string
          created_by?: string | null
          data_admissao?: string | null
          email?: string | null
          experiencia_concluida?: boolean
          funcao?: string | null
          id?: string
          nome: string
          obra_id?: string | null
          observacoes?: string | null
          setor?: string | null
          telefone?: string | null
          updated_at?: string
          validade_meses_aso?: number | null
          validade_meses_ferias?: number | null
          validade_meses_ficha_epi?: number | null
          validade_meses_folga_campo?: number | null
          vencimento_aso?: string | null
          vencimento_ferias?: string | null
          vencimento_ficha_epi?: string | null
          vencimento_folga_campo?: string | null
          vencimento_treinamento?: string | null
        }
        Update: {
          ativo?: boolean
          cpf?: string | null
          created_at?: string
          created_by?: string | null
          data_admissao?: string | null
          email?: string | null
          experiencia_concluida?: boolean
          funcao?: string | null
          id?: string
          nome?: string
          obra_id?: string | null
          observacoes?: string | null
          setor?: string | null
          telefone?: string | null
          updated_at?: string
          validade_meses_aso?: number | null
          validade_meses_ferias?: number | null
          validade_meses_ficha_epi?: number | null
          validade_meses_folga_campo?: number | null
          vencimento_aso?: string | null
          vencimento_ferias?: string | null
          vencimento_ficha_epi?: string | null
          vencimento_folga_campo?: string | null
          vencimento_treinamento?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "funcionarios_obra_id_fkey"
            columns: ["obra_id"]
            isOneToOne: false
            referencedRelation: "obras"
            referencedColumns: ["id"]
          },
        ]
      }
      materiais: {
        Row: {
          ativo: boolean
          codigo: string | null
          created_at: string
          descricao: string | null
          estoque_atual: number
          estoque_minimo: number
          id: string
          nome: string
          preco_medio: number | null
          unidade: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          codigo?: string | null
          created_at?: string
          descricao?: string | null
          estoque_atual?: number
          estoque_minimo?: number
          id?: string
          nome: string
          preco_medio?: number | null
          unidade?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          codigo?: string | null
          created_at?: string
          descricao?: string | null
          estoque_atual?: number
          estoque_minimo?: number
          id?: string
          nome?: string
          preco_medio?: number | null
          unidade?: string
          updated_at?: string
        }
        Relationships: []
      }
      material_movimentos: {
        Row: {
          created_at: string
          created_by: string | null
          data: string
          id: string
          material_id: string
          obra_id: string | null
          observacoes: string | null
          quantidade: number
          tipo: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data?: string
          id?: string
          material_id: string
          obra_id?: string | null
          observacoes?: string | null
          quantidade: number
          tipo: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data?: string
          id?: string
          material_id?: string
          obra_id?: string | null
          observacoes?: string | null
          quantidade?: number
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_movimentos_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materiais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_movimentos_obra_id_fkey"
            columns: ["obra_id"]
            isOneToOne: false
            referencedRelation: "obras"
            referencedColumns: ["id"]
          },
        ]
      }
      obras: {
        Row: {
          created_at: string
          endereco: string | null
          id: string
          nome: string
          observacoes: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          endereco?: string | null
          id?: string
          nome: string
          observacoes?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          endereco?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          id: string
          nome: string
          setor: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id: string
          nome: string
          setor?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          nome?: string
          setor?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      tarefa_execucoes: {
        Row: {
          created_at: string
          created_by: string | null
          executado_em: string
          executor_id: string | null
          executor_nome: string | null
          id: string
          observacao: string | null
          tarefa_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          executado_em?: string
          executor_id?: string | null
          executor_nome?: string | null
          id?: string
          observacao?: string | null
          tarefa_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          executado_em?: string
          executor_id?: string | null
          executor_nome?: string | null
          id?: string
          observacao?: string | null
          tarefa_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tarefa_execucoes_tarefa_id_fkey"
            columns: ["tarefa_id"]
            isOneToOne: false
            referencedRelation: "tarefas"
            referencedColumns: ["id"]
          },
        ]
      }
      tarefas: {
        Row: {
          concluida: boolean
          concluida_em: string | null
          created_at: string
          created_by: string | null
          data_vencimento: string | null
          descricao: string | null
          id: string
          prioridade: Database["public"]["Enums"]["task_priority"]
          responsavel_id: string | null
          status: Database["public"]["Enums"]["task_status"]
          titulo: string
          updated_at: string
        }
        Insert: {
          concluida?: boolean
          concluida_em?: string | null
          created_at?: string
          created_by?: string | null
          data_vencimento?: string | null
          descricao?: string | null
          id?: string
          prioridade?: Database["public"]["Enums"]["task_priority"]
          responsavel_id?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          titulo: string
          updated_at?: string
        }
        Update: {
          concluida?: boolean
          concluida_em?: string | null
          created_at?: string
          created_by?: string | null
          data_vencimento?: string | null
          descricao?: string | null
          id?: string
          prioridade?: Database["public"]["Enums"]["task_priority"]
          responsavel_id?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          titulo?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_module_permissions: {
        Row: {
          can_delete: boolean
          can_edit: boolean
          can_view: boolean
          created_at: string
          id: string
          module: string
          updated_at: string
          user_id: string
        }
        Insert: {
          can_delete?: boolean
          can_edit?: boolean
          can_view?: boolean
          created_at?: string
          id?: string
          module: string
          updated_at?: string
          user_id: string
        }
        Update: {
          can_delete?: boolean
          can_edit?: boolean
          can_view?: boolean
          created_at?: string
          id?: string
          module?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_delete_user: { Args: { _user_id: string }; Returns: undefined }
      admin_set_role: {
        Args: {
          _grant: boolean
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: undefined
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin_or_gestor: { Args: { _user_id: string }; Returns: boolean }
      promote_to_admin_if_no_admin: { Args: never; Returns: string }
    }
    Enums: {
      app_role: "admin" | "gestor" | "colaborador" | "financeiro"
      epi_movimento_tipo: "entrada" | "saida" | "devolucao"
      task_priority: "baixa" | "media" | "alta"
      task_status: "pendente" | "em_andamento" | "concluida"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "gestor", "colaborador", "financeiro"],
      epi_movimento_tipo: ["entrada", "saida", "devolucao"],
      task_priority: ["baixa", "media", "alta"],
      task_status: ["pendente", "em_andamento", "concluida"],
    },
  },
} as const
