import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

interface AiMessage {
  role: string;
  content: string;
}

interface AiChoice {
  message: AiMessage;
}

interface AiResponse {
  choices: AiChoice[];
}

interface ParsedFicha {
  nome?: string;
  cpf?: string;
  telefone?: string;
  email?: string;
  endereco?: string;
  cidade?: string;
  funcao?: string;
  setor?: string;
  data_admissao?: string;
}

interface ParsedCupom {
  data?: string;
  estabelecimento?: string;
  valor?: string | number;
  categoria?: string;
}

export type CupomOCR = {
  data: string | null;
  estabelecimento: string | null;
  valor: number | null;
  categoria: string | null;
};

export type FichaRegistroOCR = {
  nome: string | null;
  cpf: string | null;
  telefone: string | null;
  email: string | null;
  endereco: string | null;
  cidade: string | null;
  funcao: string | null;
  setor: string | null;
  data_admissao: string | null;
};

const FICHA_SYSTEM_PROMPT =
  "Você extrai dados de fichas de registro de funcionários brasileiras. Responda SOMENTE com JSON válido, sem markdown, no formato " +
  '{"nome":string|null,"cpf":string|null,"telefone":string|null,"email":string|null,"endereco":string|null,"cidade":string|null,"funcao":string|null,"setor":string|null,"data_admissao":"YYYY-MM-DD"|null}. ' +
  "Extraia apenas o que estiver legível. Não invente dados. Para datas, converta para YYYY-MM-DD.";

function parseFichaJson(raw: string): FichaRegistroOCR {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Não foi possível interpretar a ficha de registro");
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    throw new Error("Não foi possível interpretar a ficha de registro");
  }
  const text = (key: string) =>
    typeof parsed[key] === "string" && parsed[key].trim() ? parsed[key].trim() : null;
  const date = text("data_admissao");
  return {
    nome: text("nome"),
    cpf: text("cpf"),
    telefone: text("telefone"),
    email: text("email"),
    endereco: text("endereco"),
    cidade: text("cidade"),
    funcao: text("funcao"),
    setor: text("setor"),
    data_admissao: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
  };
}

export const lerFichaRegistro = createServerFn({ method: "POST" })
  .inputValidator(z.object({ imageDataUrl: z.string().min(32).max(8_000_000) }))
  .handler(async ({ data }): Promise<FichaRegistroOCR> => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("IA indisponível: chave não configurada");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: FICHA_SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Leia esta ficha de registro e extraia os dados do funcionário.",
              },
              { type: "image_url", image_url: { url: data.imageDataUrl } },
            ],
          },
        ],
      }),
    });

    if (res.status === 429)
      throw new Error("Muitas leituras seguidas. Tente novamente em instantes.");
    if (res.status === 402) throw new Error("Créditos de IA esgotados no workspace.");
    if (!res.ok) throw new Error("Falha ao ler a ficha de registro");

    const raw: string = ((await res.json()) as AiResponse)?.choices?.[0]?.message?.content ?? "";
    return parseFichaJson(raw);
  });

export const lerFichaRegistroPdf = createServerFn({ method: "POST" })
  .inputValidator(z.object({ pdfBase64: z.string().min(32).max(100_000_000) }))
  .handler(async ({ data }): Promise<FichaRegistroOCR> => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("IA indisponível: chave não configurada");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: FICHA_SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Leia este PDF de ficha de registro e extraia os dados do funcionário.",
              },
              {
                type: "image_url",
                image_url: { url: `data:application/pdf;base64,${data.pdfBase64}` },
              },
            ],
          },
        ],
      }),
    });

    if (res.status === 429)
      throw new Error("Muitas leituras seguidas. Tente novamente em instantes.");
    if (res.status === 402) throw new Error("Créditos de IA esgotados no workspace.");
    if (!res.ok) throw new Error("Falha ao analisar o PDF da ficha");

    const raw: string = ((await res.json()) as AiResponse)?.choices?.[0]?.message?.content ?? "";
    return parseFichaJson(raw);
  });

export type CupomAbastecimentoOCR = {
  data: string | null;
  posto: string | null;
  tipo_combustivel: string | null;
  litros: number | null;
  valor_por_litro: number | null;
  valor_total: number | null;
};

const ABASTECIMENTO_SYSTEM_PROMPT =
  "Você extrai dados de cupons/notas fiscais de POSTOS DE COMBUSTÍVEL brasileiros. Responda SOMENTE com JSON válido, sem markdown, no formato " +
  '{"data":"YYYY-MM-DD"|null,"posto":string|null,"tipo_combustivel":string|null,"litros":number|null,"valor_por_litro":number|null,"valor_total":number|null}. ' +
  "Regras: data = data da venda em YYYY-MM-DD (converta DD/MM/AAAA); posto = nome do posto/estabelecimento; " +
  'tipo_combustivel = um de: "gasolina", "etanol", "diesel", "diesel S10", "GNV", "flex", "eletrico" (ex.: "GASOLINA COMUM" vira "gasolina", "ÓLEO DIESEL S10" vira "diesel S10"); ' +
  "litros = quantidade abastecida; valor_por_litro = preço unitário; valor_total = valor TOTAL pago (ponto como separador decimal). " +
  "Extraia apenas o que estiver legível. Não invente dados.";

function parseNum(v: unknown): number | null {
  const n =
    typeof v === "number"
      ? v
      : typeof v === "string"
        ? Number(
            v
              .replace(/[^\d,.-]/g, "")
              .replace(/\.(?=\d{3}\b)/g, "")
              .replace(",", "."),
          )
        : NaN;
  return Number.isFinite(n) ? n : null;
}

function parseAbastecimentoJson(raw: string): CupomAbastecimentoOCR {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Não foi possível interpretar o cupom de abastecimento");
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    throw new Error("Não foi possível interpretar o cupom de abastecimento");
  }
  const text = (key: string) =>
    typeof parsed[key] === "string" && (parsed[key] as string).trim()
      ? (parsed[key] as string).trim()
      : null;
  const date = text("data");
  return {
    data: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
    posto: text("posto"),
    tipo_combustivel: text("tipo_combustivel"),
    litros: parseNum(parsed["litros"]),
    valor_por_litro: parseNum(parsed["valor_por_litro"]),
    valor_total: parseNum(parsed["valor_total"]),
  };
}

async function chamarIaAbastecimento(
  apiKey: string,
  instrucao: string,
  imagem: { type: string; url: string },
): Promise<CupomAbastecimentoOCR> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: ABASTECIMENTO_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: instrucao },
            { type: "image_url", image_url: { url: imagem.url } },
          ],
        },
      ],
    }),
  });

  if (res.status === 429)
    throw new Error("Muitas leituras seguidas. Tente novamente em instantes.");
  if (res.status === 402) throw new Error("Créditos de IA esgotados no workspace.");
  if (!res.ok) throw new Error("Falha ao ler o cupom de abastecimento");

  const raw: string = ((await res.json()) as AiResponse)?.choices?.[0]?.message?.content ?? "";
  return parseAbastecimentoJson(raw);
}

export const lerCupomAbastecimento = createServerFn({ method: "POST" })
  .inputValidator(z.object({ imageDataUrl: z.string().min(32).max(8_000_000) }))
  .handler(async ({ data }): Promise<CupomAbastecimentoOCR> => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("IA indisponível: chave não configurada");
    return chamarIaAbastecimento(apiKey, "Extraia os dados deste cupom de abastecimento.", {
      type: "image",
      url: data.imageDataUrl,
    });
  });

export const lerCupomAbastecimentoPdf = createServerFn({ method: "POST" })
  .inputValidator(z.object({ pdfBase64: z.string().min(32).max(100_000_000) }))
  .handler(async ({ data }): Promise<CupomAbastecimentoOCR> => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("IA indisponível: chave não configurada");
    return chamarIaAbastecimento(
      apiKey,
      "Extraia os dados deste cupom/nota de abastecimento em PDF.",
      { type: "pdf", url: `data:application/pdf;base64,${data.pdfBase64}` },
    );
  });

export const lerCupomFiscal = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      // data URL (image/jpeg;base64,...) do cupom
      imageDataUrl: z.string().min(32).max(8_000_000),
    }),
  )
  .handler(async ({ data }): Promise<CupomOCR> => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("IA indisponível: chave não configurada");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "Você extrai dados de cupons fiscais e notas brasileiras. Responda SOMENTE com JSON válido, sem markdown, no formato " +
              '{"data":"YYYY-MM-DD"|null,"estabelecimento":string|null,"valor":number|null,"categoria":string|null}. ' +
              "valor = valor TOTAL pago (ponto como separador decimal). categoria = uma palavra (Combustível, Alimentação, Material, Transporte, Hospedagem, Ferramentas, Outros).",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Extraia data, estabelecimento, valor total e categoria deste cupom.",
              },
              { type: "image_url", image_url: { url: data.imageDataUrl } },
            ],
          },
        ],
      }),
    });

    if (res.status === 429)
      throw new Error("Muitas leituras seguidas. Tente novamente em instantes.");
    if (res.status === 402) throw new Error("Créditos de IA esgotados no workspace.");
    if (!res.ok) throw new Error("Falha ao ler o cupom");

    const json = (await res.json()) as AiResponse;
    const raw: string = json?.choices?.[0]?.message?.content ?? "";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Não foi possível interpretar o cupom");

    let parsed: ParsedCupom;
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      throw new Error("Não foi possível interpretar o cupom");
    }

    const valorNum =
      typeof parsed.valor === "number"
        ? parsed.valor
        : typeof parsed.valor === "string"
          ? Number(
              parsed.valor
                .replace(/[^\d,.-]/g, "")
                .replace(/\.(?=\d{3}\b)/g, "")
                .replace(",", "."),
            )
          : null;

    const dataStr =
      typeof parsed.data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.data)
        ? parsed.data
        : null;

    return {
      data: dataStr,
      estabelecimento: typeof parsed.estabelecimento === "string" ? parsed.estabelecimento : null,
      valor: Number.isFinite(valorNum) ? (valorNum as number) : null,
      categoria: typeof parsed.categoria === "string" ? parsed.categoria : null,
    };
  });
