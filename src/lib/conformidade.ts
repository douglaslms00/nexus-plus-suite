import { differenceInDays, parseISO } from "date-fns";
import type { Funcionario } from "@/integrations/supabase/database.types";

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
  return statusFromDays(differenceInDays(parseISO(date), today));
}

export type FuncionarioConf = {
  funcionario: Funcionario;
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
  if ((f as any)?.experiencia_concluida) return true;
  const v = (f as any)?.vencimento_experiencia as string | null | undefined;
  if (v) return differenceInDays(parseISO(v), today) < 0;
  return false;
}

export function computeConformidade(
  funcionarios: Funcionario[],
  today = new Date(),
): FuncionarioConf[] {
  return funcionarios.map((f) => {
    const experienciaConcluida = isExperienciaConcluida(f as any, today);
    const items = VENC_FIELDS.map(({ key, label }) => {
      const v = f[key];
      if (!v) return { key, label, status: null, dias: null, data: null };
      // Experiência concluída não gera alerta: trata como sem status
      if (key === "vencimento_experiencia" && experienciaConcluida) {
        const dias = differenceInDays(parseISO(v), today);
        return { key, label, status: null, dias, data: v };
      }
      const dias = differenceInDays(parseISO(v), today);
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
