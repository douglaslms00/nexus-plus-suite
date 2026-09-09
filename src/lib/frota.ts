import { differenceInDays } from "date-fns";
import { safeParseISO } from "@/lib/utils";

// Tipos espelhando as tabelas
export type Veiculo = {
  id: string;
  placa: string;
  modelo: string;
  marca?: string | null;
  ano?: number | null;
  tipo?: string;
  combustivel_padrao?: string;
  odometro_atual: number;
  odometro_proxima_revisao?: number | null;
  data_proxima_revisao?: string | null;
  intervalo_revisao_km: number;
  intervalo_revisao_meses: number;
  status: string;
  obra_id?: string | null;
};

export type Motorista = {
  id: string;
  nome: string;
  cpf?: string | null;
  cnh_numero?: string | null;
  cnh_categoria: string;
  cnh_validade?: string | null;
  status: string;
};

export type Abastecimento = {
  id: string;
  data: string;
  veiculo_id: string;
  motorista_id?: string | null;
  odometro: number;
  litros: number;
  tipo_combustivel: string;
  valor_por_litro: number;
  valor_total: number;
  created_at?: string;
};

// Calcula km/L e R$/km a partir de lista ordenada de abastecimentos do mesmo veículo
export function calcConsumo(abastecimentos: Abastecimento[]): {
  mediaKml: number | null;
  custoPorKm: number | null;
  totalKm: number;
  totalLitros: number;
  totalGasto: number;
} {
  if (abastecimentos.length < 2)
    return { mediaKml: null, custoPorKm: null, totalKm: 0, totalLitros: 0, totalGasto: 0 };
  const sorted = [...abastecimentos].sort((a, b) => {
    if (a.data !== b.data) return String(a?.data ?? "").localeCompare(String(b?.data ?? ""));
    return Number(a?.odometro ?? 0) - Number(b?.odometro ?? 0);
  });
  let totalKm = 0;
  let totalLitros = 0;
  let totalGasto = 0;
  for (let i = 1; i < sorted.length; i++) {
    const km = sorted[i].odometro - sorted[i - 1].odometro;
    if (km <= 0) continue;
    totalKm += km;
    totalLitros += Number(sorted[i].litros);
    totalGasto += Number(sorted[i].valor_total);
  }
  // litros do primeiro abastecimento não entra no consumo (sem km anterior) — já tratado acima
  // Mas somamos litros totais a partir do segundo em diante; ajuste: totalLitros já é do segundo em diante
  // Para totalLitros real incluir todos: usar soma total; para média usar segundo em diante
  const mediaKml = totalLitros > 0 ? totalKm / totalLitros : null;
  const custoPorKm = totalKm > 0 ? totalGasto / totalKm : null;
  return { mediaKml, custoPorKm, totalKm, totalLitros, totalGasto };
}

// Para exibição por linha: calcula métricas do abastecimento atual vs anterior
export function calcLinhaConsumo(
  atual: Abastecimento,
  anterior: Abastecimento | null,
): { kmRodados: number | null; mediaKml: number | null; custoPorKm: number | null } {
  if (!anterior) return { kmRodados: null, mediaKml: null, custoPorKm: null };
  const km = atual.odometro - anterior.odometro;
  if (km <= 0 || Number(atual.litros) <= 0)
    return { kmRodados: km, mediaKml: null, custoPorKm: null };
  const mediaKml = km / Number(atual.litros);
  const custoPorKm = Number(atual.valor_total) / km;
  return { kmRodados: km, mediaKml, custoPorKm };
}

export type AlertaRevisao = {
  tipo: "km" | "tempo" | "ambos";
  nivel: "ok" | "atencao" | "vencido";
  msg: string;
  diasAte?: number;
  kmAte?: number;
};

export function alertaRevisao(v: Veiculo): AlertaRevisao {
  const hoje = new Date();
  let kmAte: number | undefined;
  let diasAte: number | undefined;
  let vencidoKm = false;
  let vencidoTempo = false;
  let atencaoKm = false;
  let atencaoTempo = false;

  if (v.odometro_proxima_revisao != null) {
    kmAte = v.odometro_proxima_revisao - v.odometro_atual;
    vencidoKm = kmAte <= 0;
    atencaoKm = kmAte > 0 && kmAte <= 1000;
  }
  if (v.data_proxima_revisao) {
    const d = safeParseISO(v.data_proxima_revisao);
    if (!isNaN(d.getTime())) {
      diasAte = differenceInDays(d, hoje);
      vencidoTempo = diasAte < 0;
      atencaoTempo = diasAte >= 0 && diasAte <= 15;
    }
  }

  if (vencidoKm || vencidoTempo) {
    const parts: string[] = [];
    if (vencidoKm) parts.push(`${Math.abs(kmAte ?? 0).toLocaleString("pt-BR")} km atrasado`);
    if (vencidoTempo) parts.push(`${Math.abs(diasAte ?? 0)} dias atrasado`);
    return {
      tipo: vencidoKm && vencidoTempo ? "ambos" : vencidoKm ? "km" : "tempo",
      nivel: "vencido",
      msg: `Revisão vencida: ${parts.join(" + ")}`,
      diasAte,
      kmAte,
    };
  }
  if (atencaoKm || atencaoTempo) {
    const parts: string[] = [];
    if (atencaoKm) parts.push(`faltam ${kmAte} km`);
    if (atencaoTempo) parts.push(`faltam ${diasAte} dias`);
    return {
      tipo: atencaoKm && atencaoTempo ? "ambos" : atencaoKm ? "km" : "tempo",
      nivel: "atencao",
      msg: `Revisão próxima: ${parts.join(" + ")}`,
      diasAte,
      kmAte,
    };
  }
  const parts: string[] = [];
  if (kmAte != null) parts.push(`${kmAte.toLocaleString("pt-BR")} km`);
  if (diasAte != null) parts.push(`${diasAte} dias`);
  return {
    tipo: kmAte != null && diasAte != null ? "ambos" : kmAte != null ? "km" : "tempo",
    nivel: "ok",
    msg: parts.length ? `Próxima em ${parts.join(" • ")}` : "Sem revisão programada",
    diasAte,
    kmAte,
  };
}

export function statusCNH(cnh_validade?: string | null): {
  nivel: "ok" | "atencao" | "vencido" | "sem_data";
  label: string;
  dias?: number;
} {
  if (!cnh_validade) return { nivel: "sem_data", label: "Sem data" };
  const d = safeParseISO(cnh_validade);
  if (isNaN(d.getTime())) return { nivel: "sem_data", label: "Data inválida" };
  const dias = differenceInDays(d, new Date());
  if (dias < 0) return { nivel: "vencido", label: `Vencida há ${Math.abs(dias)} dias`, dias };
  if (dias <= 30) return { nivel: "atencao", label: `Vence em ${dias} dias`, dias };
  return { nivel: "ok", label: `Válida (${dias} dias)`, dias };
}

export const CATEGORIAS_GASTO = [
  "lavagem",
  "estacionamento",
  "multas",
  "guincho",
  "taxas administrativas",
  "IPVA",
  "seguro",
  "licenciamento",
  "pneus",
  "outro",
] as const;

export const TIPOS_COMBUSTIVEL = [
  "gasolina",
  "etanol",
  "diesel",
  "diesel S10",
  "GNV",
  "flex",
  "eletrico",
] as const;
export const TIPOS_SERVICO = [
  "troca de óleo",
  "pneus",
  "freios",
  "suspensão",
  "motor",
  "elétrica",
  "funilaria",
  "revisão preventiva",
  "outro",
] as const;
export const OPERADORAS_TAG = ["Sem Parar", "ConectCar", "Veloe", "Outra"] as const;

export function formatPlaca(v: string): string {
  const s = v.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (s.length <= 7) return s;
  return s.slice(0, 7);
}

// Ranking: agrega por motorista
export function rankingMotoristas(
  motoristas: Motorista[],
  abastecimentos: Abastecimento[],
  gastosAvulsos: { motorista_id?: string | null; valor: number }[],
  pedagios: { motorista_id?: string | null; valor: number }[],
): Array<{
  motorista: Motorista;
  totalAbast: number;
  gastoComb: number;
  gastoAvulso: number;
  gastoPedagio: number;
  gastoTotal: number;
  mediaKml: number | null;
}> {
  const byMot = new Map<string, Abastecimento[]>();
  for (const a of abastecimentos) {
    if (!a.motorista_id) continue;
    const arr = byMot.get(a.motorista_id) ?? [];
    arr.push(a);
    byMot.set(a.motorista_id, arr);
  }
  const gastoAvulsoMap = new Map<string, number>();
  for (const g of gastosAvulsos) {
    if (!g.motorista_id) continue;
    gastoAvulsoMap.set(g.motorista_id, (gastoAvulsoMap.get(g.motorista_id) ?? 0) + Number(g.valor));
  }
  const pedagioMap = new Map<string, number>();
  for (const p of pedagios) {
    if (!p.motorista_id) continue;
    pedagioMap.set(p.motorista_id, (pedagioMap.get(p.motorista_id) ?? 0) + Number(p.valor));
  }
  return motoristas
    .map((m) => {
      const abs = byMot.get(m.id) ?? [];
      const { mediaKml } = calcConsumo(abs);
      const gastoComb = abs.reduce((s, a) => s + Number(a.valor_total), 0);
      const gastoAvulso = gastoAvulsoMap.get(m.id) ?? 0;
      const gastoPedagio = pedagioMap.get(m.id) ?? 0;
      return {
        motorista: m,
        totalAbast: abs.length,
        gastoComb,
        gastoAvulso,
        gastoPedagio,
        gastoTotal: gastoComb + gastoAvulso + gastoPedagio,
        mediaKml,
      };
    })
    .sort((a, b) => {
      // ranking por eficiência: maior km/L primeiro; empate menor gastoTotal
      if (a.mediaKml != null && b.mediaKml != null) {
        if (b.mediaKml !== a.mediaKml) return b.mediaKml - a.mediaKml;
      } else if (a.mediaKml != null) return -1;
      else if (b.mediaKml != null) return 1;
      return a.gastoTotal - b.gastoTotal;
    });
}

export function parseCSVPedagio(text: string): Array<{
  data_hora: string;
  praca: string;
  rota?: string;
  valor: number;
  veiculo_placa?: string;
}> {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0].split(/[,;]/).map((h) => h.trim().toLowerCase());
  const idxData = header.findIndex((h) => /data/.test(h));
  const idxPraca = header.findIndex((h) => /pra[cç]a/.test(h));
  const idxValor = header.findIndex((h) => /valor|tarifa/.test(h));
  const idxRota = header.findIndex((h) => /rota|rodovia|via/.test(h));
  const idxPlaca = header.findIndex((h) => /placa/.test(h));
  const out: Array<{
    data_hora: string;
    praca: string;
    valor: number;
    rota?: string;
    veiculo_placa?: string;
  }> = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(/[,;]/).map((c) => c.trim().replace(/^"|"$/g, ""));
    const valorRaw = idxValor >= 0 ? cols[idxValor] : "";
    const valor = Number(valorRaw.replace("R$", "").replace(/\./g, "").replace(",", ".").trim());
    if (isNaN(valor)) continue;
    const praca = idxPraca >= 0 ? cols[idxPraca] : (cols[1] ?? "—");
    const dataRaw = idxData >= 0 ? cols[idxData] : cols[0];
    // tenta parsear dd/mm/yyyy hh:mm ou iso
    let iso = dataRaw;
    const m = dataRaw.match(/(\d{2})\/(\d{2})\/(\d{4})\s*(\d{2}:\d{2}(:\d{2})?)?/);
    if (m) {
      const [, d, mo, y, hm] = m;
      iso = `${y}-${mo}-${d}T${hm || "12:00:00"}`;
    }
    out.push({
      data_hora: iso,
      praca: praca || "—",
      rota: idxRota >= 0 ? cols[idxRota] : undefined,
      valor,
      veiculo_placa: idxPlaca >= 0 ? cols[idxPlaca] : undefined,
    });
  }
  return out;
}
