import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildGestaoProAssistantPrompt } from "@/lib/gestaopro-assistant-prompt";
import { getCopilotAccessContext } from "@/lib/copilot-permissions.server";

type StoredMessage = { role: "user" | "assistant"; parts: { type: "text"; text: string }[] };

/** Envia uma mensagem numa conversa do próprio usuário e salva a resposta. */
export const askCopilot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ threadId: z.string().uuid(), text: z.string().trim().min(1).max(4000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: thread, error: tErr } = await supabase
      .from("copilot_threads")
      .select("id,title,user_id")
      .eq("id", data.threadId)
      .eq("user_id", userId)
      .maybeSingle();
    if (tErr || !thread) throw new Error("Conversa não encontrada.");

    const userMsg: StoredMessage = { role: "user", parts: [{ type: "text", text: data.text }] };
    const { error: insErr } = await supabase
      .from("copilot_messages")
      .insert({ thread_id: thread.id, user_id: userId, ui_message: userMsg as never });
    if (insErr) throw new Error("Não foi possível salvar sua mensagem.");

    const { data: rows, error: historyError } = await supabase
      .from("copilot_messages")
      .select("ui_message")
      .eq("thread_id", thread.id)
      .order("created_at", { ascending: false })
      .limit(12);
    if (historyError) throw new Error("Não foi possível carregar o histórico da conversa.");
    const history = (rows ?? [])
      .reverse()
      .map((r) => r.ui_message as unknown as StoredMessage)
      .map((m) => ({ role: m.role, content: m.parts.map((p) => p.text).join("") }));

    const [{ data: profile, error: profileError }, access] = await Promise.all([
      supabase.from("profiles").select("nome").eq("id", userId).maybeSingle(),
      getCopilotAccessContext(supabase, userId),
    ]);
    if (profileError) throw new Error("Não foi possível carregar o perfil do usuário.");
    const userName = String(profile?.nome ?? "Usuário autenticado").slice(0, 100);

    const instructions = buildGestaoProAssistantPrompt({
      userName,
      roleLabel: access.roleLabel,
      permissions: access.permissions,
      currentDate: new Date().toISOString().slice(0, 10),
    });

    const { generateResponse, GatewayError, PaymentRequiredError, RateLimitError } = await import(
      "@lovable.dev/ai-gateway"
    );
    let answer = "";
    try {
      const res = await generateResponse({
        model: "openai/gpt-6-astra",
        instructions,
        input: history.map((m) => ({ role: m.role, content: m.content })),
      });
      const output = (res as unknown as { output?: { content?: { type?: string; text?: unknown }[] }[] }).output ?? [];
      answer = output
        .flatMap((o) => o.content ?? [])
        .filter((c) => c.type === "output_text" && typeof c.text === "string")
        .map((c) => c.text as string)
        .join("")
        .trim();
    } catch (e) {
      if (e instanceof RateLimitError) throw new Error("Muitas mensagens. Tente novamente em instantes.");
      if (e instanceof PaymentRequiredError) throw new Error("Créditos de IA esgotados no workspace.");
      if (e instanceof GatewayError) console.error("copilot gateway", e.code, e.ids);
      throw new Error("Não foi possível responder agora. Tente novamente.");
    }
    if (!answer) throw new Error("O Copilot não retornou uma resposta. Tente novamente.");

    const botMsg: StoredMessage = { role: "assistant", parts: [{ type: "text", text: answer }] };
    const { error: botErr } = await supabase
      .from("copilot_messages")
      .insert({ thread_id: thread.id, user_id: userId, ui_message: botMsg as never });
    if (botErr) throw new Error("Resposta gerada, mas não foi possível salvá-la.");
    await supabase
      .from("copilot_threads")
      .update({
        updated_at: new Date().toISOString(),
        ...(thread.title === "Nova conversa" ? { title: data.text.slice(0, 60) } : {}),
      })
      .eq("id", thread.id);
    return { ok: true };
  });
