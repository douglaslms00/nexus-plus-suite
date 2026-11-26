import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { buildGestaoProAssistantPrompt } from "@/lib/gestaopro-assistant-prompt";

const inputSchema = z.object({
  accessToken: z.string().min(20).max(10_000),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(4_000),
      }),
    )
    .min(1)
    .max(12),
});

type GatewayResponse = {
  choices?: { message?: { content?: string | null } }[];
};

/**
 * Chat seguro de orientação geral. Nesta versão não há ferramentas conectadas
 * nem permissões de leitura/escrita concedidas ao modelo; os dados operacionais
 * continuam disponíveis apenas pelas telas protegidas do sistema.
 */
export const chatGestaoPro = createServerFn({ method: "POST" })
  .inputValidator(inputSchema)
  .handler(async ({ data }) => {
    const supabaseUrl = process.env["SUPABASE_URL"];
    const supabaseKey = process.env["SUPABASE_PUBLISHABLE_KEY"];
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!supabaseUrl || !supabaseKey) throw new Error("Autenticação indisponível.");
    if (!apiKey) throw new Error("Copilot indisponível: chave de IA não configurada.");

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await supabase.auth.getUser(data.accessToken);
    if (authError || !authData.user) throw new Error("Sua sessão expirou. Entre novamente.");

    const userName =
      typeof authData.user.user_metadata?.full_name === "string"
        ? authData.user.user_metadata.full_name.slice(0, 100)
        : typeof authData.user.user_metadata?.name === "string"
          ? authData.user.user_metadata.name.slice(0, 100)
          : "Usuário autenticado";

    // Falha segura: não inferimos papel nem permissões pelo texto do cliente.
    const systemPrompt =
      buildGestaoProAssistantPrompt({
        userName,
        roleLabel: "não verificado pelo serviço do Copilot",
        permissions: [],
        currentDate: new Date().toISOString().slice(0, 10),
      }) +
      "\n\n# LIMITES DESTA VERSÃO\nVocê está em modo de orientação geral: não há ferramentas de consulta ou alteração conectadas. Não afirme que leu documentos, consultou estoque, acessou relatórios ou alterou dados. Para informações reais do sistema, oriente o usuário a abrir o módulo correspondente. Não solicite senhas, tokens ou outros segredos.";

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          ...data.messages.slice(-12).map(({ role, content }) => ({ role, content })),
        ],
        temperature: 0.3,
        max_tokens: 800,
      }),
    });

    if (response.status === 429) throw new Error("Muitas mensagens. Tente novamente em instantes.");
    if (response.status === 402) throw new Error("Créditos de IA esgotados no workspace.");
    if (!response.ok) throw new Error("Não foi possível responder agora. Tente novamente.");

    const result = (await response.json()) as GatewayResponse;
    const answer = result.choices?.[0]?.message?.content?.trim();
    if (!answer) throw new Error("O Copilot não retornou uma resposta. Tente novamente.");
    return { answer };
  });
