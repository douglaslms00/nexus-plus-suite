import { differenceInDays } from "date-fns";
import type { Funcionario } from "@/integrations/supabase/database.types";
import { safeParseISO } from "@/lib/utils";

export type Status = "verde" | "amarelo" | "vermelho";

export const VENC_FIELDS = [
  { key: "vencimento_aso", label: "ASO" },
  { key: "vencimento_treinamento", label: "Treinamento" },
  { key: "vencimento_folga_campo", label: "Folga de Campo" },
  { key: "vencimento_ferias", label: "Férias" },
  { key: "vencimento_ficha_epi", label: "Ficha EPI" },
  { key: "vencimento_experiencia", label: "Experiência" },
] as const;

export function statusFromDays(days: number): Status {
  if (days < 0) return "vermelho";
  if (days <= 30) return "amarelo";
  return "verde";
}

export function statusFromDate(date: string | null | undefined, today = new Date()): Status | null {
  if (!date) return null;
  return statusFromDays(differenceInDays(safeParseISO(date), today));
}

export type FuncionarioConf = {
  funcionario: Partial<Funcionario> & { id: string; nome: string };
  items: {
    key: string;
    label: string;
    status: Status | null;
    dias: number | null;
    data: string | null;
  }[];
  pior: Status;
};

export function isExperienciaConcluida(
  f: Pick<Funcionario, "experiencia_concluida" | "vencimento_experiencia">,
  today = new Date(),
): boolean {
  if (f?.experiencia_concluida) return true;
  const v = f?.vencimento_experiencia as string | null | undefined;
  if (v) return differenceInDays(safeParseISO(v), today) < 0;
  return false;
}

export function computeConformidade(
  funcionarios: Array<Partial<Funcionario> & { id: string; nome: string }>,
  today = new Date(),
): FuncionarioConf[] {
  return funcionarios.map((f) => {
    const experienciaConcluida = isExperienciaConcluida(
      f as Pick<Funcionario, "experiencia_concluida" | "vencimento_experiencia">,
      today,
    );
    const items = VENC_FIELDS.map(({ key, label }) => {
      const v = (f as unknown as Record<string, string | null | undefined>)[key];
      if (!v) return { key, label, status: null, dias: null, data: null };
      // Experiência concluída não gera alerta: trata como sem status
      if (key === "vencimento_experiencia" && experienciaConcluida) {
        const dias = differenceInDays(safeParseISO(v), today);
        return { key, label, status: null, dias, data: v };
      }
      const dias = differenceInDays(safeParseISO(v), today);
      return { key, label, status: statusFromDays(dias), dias, data: v };
    });
    const pior: Status = items.some((i) => i.status === "vermelho")
      ? "vermelho"
      : items.some((i) => i.status === "amarelo")
        ? "amarelo"
        : "verde";
    return { funcionario: f, items, pior };
  });
}

export function countAlertasVencimento(conf: FuncionarioConf[]): number {
  return conf.reduce(
    (acc, c) => acc + c.items.filter((i) => i.status && i.status !== "verde").length,
    0,
  );
}
