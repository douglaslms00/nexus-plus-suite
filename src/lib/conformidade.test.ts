import { describe, it, expect } from "vitest";
import {
  statusFromDays,
  statusFromDate,
  computeConformidade,
  countAlertasVencimento,
} from "./conformidade";
import { addDays, format } from "date-fns";

const isoIn = (n: number, base = new Date()) => format(addDays(base, n), "yyyy-MM-dd");

describe("statusFromDays", () => {
  it("vermelho quando vencido", () => {
    expect(statusFromDays(-1)).toBe("vermelho");
    expect(statusFromDays(-365)).toBe("vermelho");
  });
  it("amarelo entre 0 e 30 dias", () => {
    expect(statusFromDays(0)).toBe("amarelo");
    expect(statusFromDays(15)).toBe("amarelo");
    expect(statusFromDays(30)).toBe("amarelo");
  });
  it("verde acima de 30 dias", () => {
    expect(statusFromDays(31)).toBe("verde");
    expect(statusFromDays(365)).toBe("verde");
  });
});

describe("statusFromDate", () => {
  const today = new Date("2026-06-03");
  it("retorna null quando sem data", () => {
    expect(statusFromDate(null, today)).toBeNull();
    expect(statusFromDate(undefined, today)).toBeNull();
  });
  it("classifica corretamente Treinamento e Experiência", () => {
    expect(statusFromDate(isoIn(-5, today), today)).toBe("vermelho");
    expect(statusFromDate(isoIn(10, today), today)).toBe("amarelo");
    expect(statusFromDate(isoIn(60, today), today)).toBe("verde");
  });
});

describe("computeConformidade + countAlertasVencimento", () => {
  const today = new Date("2026-06-03");
  const funcs = [
    {
      id: "1",
      nome: "A",
      vencimento_treinamento: isoIn(-1, today),
      vencimento_experiencia: isoIn(60, today),
    },
    {
      id: "2",
      nome: "B",
      vencimento_treinamento: isoIn(10, today),
      vencimento_experiencia: isoIn(-3, today),
    },
    {
      id: "3",
      nome: "C",
      vencimento_treinamento: isoIn(90, today),
      vencimento_experiencia: isoIn(180, today),
    },
  ];
  const conf = computeConformidade(funcs, today);

  it("usa a pior status como status geral", () => {
    expect(conf[0].pior).toBe("vermelho");
    expect(conf[1].pior).toBe("vermelho");
    expect(conf[2].pior).toBe("verde");
  });

  it("conta apenas itens não verdes", () => {
    expect(countAlertasVencimento(conf)).toBe(3);
  });

  it("contador bate com soma manual dos itens não verdes", () => {
    const manual = conf
      .flatMap((c) => c.items)
      .filter((i) => i.status && i.status !== "verde").length;
    expect(countAlertasVencimento(conf)).toBe(manual);
  });
});
