import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

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
          {
            role: "system",
            content:
              "Você extrai dados de fichas de registro de funcionários brasileiras. Responda SOMENTE com JSON válido, sem markdown, no formato " +
              '{"nome":string|null,"cpf":string|null,"telefone":string|null,"email":string|null,"endereco":string|null,"cidade":string|null,"funcao":string|null,"setor":string|null,"data_admissao":"YYYY-MM-DD"|null}. ' +
              "Extraia apenas o que estiver legível. Não invente dados. Para datas, converta para YYYY-MM-DD.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Leia esta ficha de registro e extraia os dados do funcionário." },
              { type: "image_url", image_url: { url: data.imageDataUrl } },
            ],
          },
        ],
      }),
    });

    if (res.status === 429) throw new Error("Muitas leituras seguidas. Tente novamente em instantes.");
    if (res.status === 402) throw new Error("Créditos de IA esgotados no workspace.");
    if (!res.ok) throw new Error("Falha ao ler a ficha de registro");

    const raw: string = ((await res.json()) as any)?.choices?.[0]?.message?.content ?? "";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Não foi possível interpretar a ficha de registro");

    let parsed: any;
    try { parsed = JSON.parse(match[0]); } catch { throw new Error("Não foi possível interpretar a ficha de registro"); }
    const text = (key: string) => typeof parsed[key] === "string" && parsed[key].trim() ? parsed[key].trim() : null;
    const date = text("data_admissao");
    return {
      nome: text("nome"), cpf: text("cpf"), telefone: text("telefone"), email: text("email"),
      endereco: text("endereco"), cidade: text("cidade"), funcao: text("funcao"), setor: text("setor"),
      data_admissao: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
    };
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
              { type: "text", text: "Extraia data, estabelecimento, valor total e categoria deste cupom." },
              { type: "image_url", image_url: { url: data.imageDataUrl } },
            ],
          },
        ],
      }),
    });

    if (res.status === 429) throw new Error("Muitas leituras seguidas. Tente novamente em instantes.");
    if (res.status === 402) throw new Error("Créditos de IA esgotados no workspace.");
    if (!res.ok) throw new Error("Falha ao ler o cupom");

    const json = (await res.json()) as any;
    const raw: string = json?.choices?.[0]?.message?.content ?? "";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Não foi possível interpretar o cupom");

    let parsed: any;
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      throw new Error("Não foi possível interpretar o cupom");
    }

    const valorNum =
      typeof parsed.valor === "number"
        ? parsed.valor
        : typeof parsed.valor === "string"
          ? Number(parsed.valor.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", "."))
          : null;

    const dataStr =
      typeof parsed.data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.data) ? parsed.data : null;

    return {
      data: dataStr,
      estabelecimento: typeof parsed.estabelecimento === "string" ? parsed.estabelecimento : null,
      valor: Number.isFinite(valorNum) ? (valorNum as number) : null,
      categoria: typeof parsed.categoria === "string" ? parsed.categoria : null,
    };
  });
