import { describe, it, expect } from "vitest";
import {
  normalizarPlaca,
  placaValidaBR,
  corrigirPlacaOcr,
  buscarVeiculoPorPlaca,
} from "./frota";

const VEICULOS = [
  { id: "1", placa: "ABC1234", modelo: "Strada", combustivel_padrao: "flex" },
  { id: "2", placa: "ABC1D23", modelo: "Hilux", combustivel_padrao: "diesel" },
  { id: "3", placa: "XYZ9876", modelo: "Onix", combustivel_padrao: "flex" },
];

describe("placas: normalização e validação", () => {
  it("normaliza com traço, espaço e minúsculas", () => {
    expect(normalizarPlaca("abc-1234")).toBe("ABC1234");
    expect(normalizarPlaca("abc 1d23")).toBe("ABC1D23");
  });

  it("valida formato antigo e Mercosul", () => {
    expect(placaValidaBR("ABC1234")).toBe(true);
    expect(placaValidaBR("ABC1D23")).toBe(true);
    expect(placaValidaBR("AB12345")).toBe(false);
    expect(placaValidaBR("ABC12")).toBe(false);
    expect(placaValidaBR(null)).toBe(false);
  });

  it("corrige confusões de OCR por posição", () => {
    // I na posição de dígito -> 1
    expect(corrigirPlacaOcr("ABCI234")).toBe("ABC1234");
    // O já é letra válida na posição 4 do Mercosul: mantém
    expect(corrigirPlacaOcr("ABC1O23")).toBe("ABC1O23");
    // 0 na posição de letra (pos 2) -> O
    expect(corrigirPlacaOcr("AB01234")).toBe("ABO1234");
  });
});

describe("buscarVeiculoPorPlaca", () => {
  it("acha match exato ignorando formatação", () => {
    const r = buscarVeiculoPorPlaca(VEICULOS, "abc-1234")!;
    expect(r.exato?.id).toBe("1");
    expect(r.sugestoes).toHaveLength(0);
  });

  it("acha via correção de OCR", () => {
    const r = buscarVeiculoPorPlaca(VEICULOS, "ABCI234")!;
    expect(r.exato?.id).toBe("1");
  });

  it("sugere próximos quando não há exato", () => {
    const r = buscarVeiculoPorPlaca(VEICULOS, "ABC1235")!;
    expect(r.exato).toBeNull();
    expect(r.sugestoes.map((s) => s.id)).toContain("1");
  });

  it("retorna null sem placa", () => {
    expect(buscarVeiculoPorPlaca(VEICULOS, null)).toBeNull();
    expect(buscarVeiculoPorPlaca(VEICULOS, "")).toBeNull();
  });

  it("não sugere veículos distantes", () => {
    const r = buscarVeiculoPorPlaca(VEICULOS, "ZZZ9999")!;
    expect(r.exato).toBeNull();
    expect(r.sugestoes).toHaveLength(0);
  });
});
