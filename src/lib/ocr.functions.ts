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

export type NotaAbastecimentoOCR = {
  data: string | null;
  posto: string | null;
  litros: number | null;
  valor_por_litro: number | null;
  valor_total: number | null;
  tipo_combustivel: string | null;
  odometro: number | null;
  /** Placa do veículo normalizada (ex.: "ABC1234" ou "ABC1D23") ou null. */
  placa: string | null;
  /** Meio de pagamento como impresso (ex.: "PIX", "Cartão de Crédito") ou null. */
  forma_pagamento: string | null;
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
  matricula: string | null;
  data_nascimento: string | null;
};

const FICHA_SYSTEM_PROMPT =
  "Você extrai dados de fichas de registro de funcionários brasileiras. Responda SOMENTE com JSON válido, sem markdown, no formato " +
  '{"nome":string|null,"cpf":string|null,"telefone":string|null,"email":string|null,"endereco":string|null,"cidade":string|null,"funcao":string|null,"setor":string|null,"data_admissao":"YYYY-MM-DD"|null,"matricula":string|null,"data_nascimento":"YYYY-MM-DD"|null}. ' +
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
  const nasc = text("data_nascimento");
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
    matricula: text("matricula"),
    data_nascimento: nasc && /^\d{4}-\d{2}-\d{2}$/.test(nasc) ? nasc : null,
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

const NOTA_ABAST_SYSTEM_PROMPT =
  "Você extrai dados de notas e cupons fiscais de abastecimento de combustível brasileiros (NFC-e / SAT de postos). Responda SOMENTE com JSON válido, sem markdown, no formato " +
  '{"data":"YYYY-MM-DD"|null,"posto":string|null,"litros":number|null,"valor_por_litro":number|null,"valor_total":number|null,"tipo_combustivel":string|null,"odometro":number|null,"placa":string|null,"forma_pagamento":string|null}. ' +
  "Regras: data = data de emissão convertida para YYYY-MM-DD; posto = nome fantasia do posto/estabelecimento (sem CNPJ); " +
  "litros = quantidade do item de COMBUSTÍVEL (unidade L ou LT — se houver vários itens, use o de combustível com maior quantidade; ignore lubrificantes, lavagem e serviços); " +
  "valor_por_litro = preço unitário do combustível; valor_total = valor TOTAL pago do cupom; " +
  'tipo_combustivel = um destes valores exatos: "gasolina", "etanol", "diesel", "diesel S10", "GNV", "flex" ou "eletrico" ' +
  '(mapeie: S10/S-10/diesel S500 comum→"diesel S10" ou "diesel" conforme impresso; comum/aditivada/grid→"gasolina"; álcool/AEHC→"etanol"; GNV→"GNV"); ' +
  "odometro = hodômetro impresso no cupom, se houver (quase nunca há — use null sem inventar). " +
  "placa = placa do veículo impressa no cupom (procure por rótulos como PLACA, VEÍCULO, FROTA, KM/PLACA). " +
  "Formatos brasileiros: antigo ABC-1234 (3 letras + 4 dígitos) ou Mercosul ABC1D23 (3 letras + dígito + letra + 2 dígitos). " +
  "Retorne a placa SEMPRE normalizada: maiúscula, só letras e dígitos, sem traço/espaço (ex.: ABC1234, ABC1D23). " +
  "Atenção a confusões comuns de leitura: 0/O, 1/I, 5/S, 8/B — use o contexto do formato (posições de letra vs dígito) para decidir. Se não houver placa legível, use null sem inventar. " +
  "forma_pagamento = meio de pagamento impresso (ex.: Dinheiro, PIX, Cartão de Crédito, Cartão de Débito, Cartão Frota) ou null. " +
  "Use ponto como separador decimal. Extraia apenas o que estiver legível. Não invente dados.";

interface ParsedNotaAbastecimento {
  data?: string;
  posto?: string;
  litros?: string | number;
  valor_por_litro?: string | number;
  valor_total?: string | number;
  tipo_combustivel?: string;
  odometro?: string | number;
  placa?: string;
  forma_pagamento?: string;
}

/** Normaliza placa BR: maiúscula, só [A-Z0-9], máx. 7 chars. */
function normalizarPlacaBR(value: string | undefined): string | null {
  if (typeof value !== "string") return null;
  const s = value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
  if (!s) return null;
  // Antigo: LLLNNNN | Mercosul: LLLNLNN
  const ok =
    /^[A-Z]{3}[0-9]{4}$/.test(s) || /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/.test(s);
  return ok ? s : null;
}

function parseNumeroBR(value: string | number | undefined): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const num = Number(
    value
      .replace(/[^\d,.-]/g, "")
      .replace(/\.(?=\d{3}\b)/g, "")
      .replace(",", "."),
  );
  return Number.isFinite(num) ? num : null;
}

function parseNotaAbastecimentoJson(raw: string): NotaAbastecimentoOCR {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Não foi possível interpretar a nota de abastecimento");
  let parsed: ParsedNotaAbastecimento;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    throw new Error("Não foi possível interpretar a nota de abastecimento");
  }
  const text = (key: "posto" | "tipo_combustivel") =>
    typeof parsed[key] === "string" && (parsed[key] as string).trim()
      ? (parsed[key] as string).trim()
      : null;
  const date =
    typeof parsed.data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.data) ? parsed.data : null;
  const formaPgto =
    typeof parsed.forma_pagamento === "string" && parsed.forma_pagamento.trim()
      ? parsed.forma_pagamento.trim().slice(0, 60)
      : null;
  return {
    data: date,
    posto: text("posto"),
    litros: parseNumeroBR(parsed.litros),
    valor_por_litro: parseNumeroBR(parsed.valor_por_litro),
    valor_total: parseNumeroBR(parsed.valor_total),
    tipo_combustivel: text("tipo_combustivel"),
    odometro: parseNumeroBR(parsed.odometro),
    placa: normalizarPlacaBR(parsed.placa),
    forma_pagamento: formaPgto,
  };
}

async function chamarIaVisao(
  systemPrompt: string,
  userText: string,
  imageUrl: string,
  erroGenerico: string,
): Promise<string> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("IA indisponível: chave não configurada");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: userText },
            { type: "image_url", image_url: { url: imageUrl } },
          ],
        },
      ],
    }),
  });

  if (res.status === 429)
    throw new Error("Muitas leituras seguidas. Tente novamente em instantes.");
  if (res.status === 402) throw new Error("Créditos de IA esgotados no workspace.");
  if (!res.ok) throw new Error(erroGenerico);

  return ((await res.json()) as AiResponse)?.choices?.[0]?.message?.content ?? "";
}

export const lerNotaAbastecimento = createServerFn({ method: "POST" })
  .inputValidator(z.object({ imageDataUrl: z.string().min(32).max(8_000_000) }))
  .handler(async ({ data }): Promise<NotaAbastecimentoOCR> => {
    const raw = await chamarIaVisao(
      NOTA_ABAST_SYSTEM_PROMPT,
      "Extraia os dados deste cupom/nota de abastecimento. Dê atenção especial à placa do veículo (PLACA/VEÍCULO/FROTA) e ao meio de pagamento.",
      data.imageDataUrl,
      "Falha ao ler a nota de abastecimento",
    );
    return parseNotaAbastecimentoJson(raw);
  });

export const lerNotaAbastecimentoPdf = createServerFn({ method: "POST" })
  .inputValidator(z.object({ pdfBase64: z.string().min(32).max(100_000_000) }))
  .handler(async ({ data }): Promise<NotaAbastecimentoOCR> => {
    const raw = await chamarIaVisao(
      NOTA_ABAST_SYSTEM_PROMPT,
      "Extraia os dados desta nota de abastecimento em PDF. Dê atenção especial à placa do veículo (PLACA/VEÍCULO/FROTA) e ao meio de pagamento.",
      `data:application/pdf;base64,${data.pdfBase64}`,
      "Falha ao analisar o PDF da nota de abastecimento",
    );
    return parseNotaAbastecimentoJson(raw);
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
