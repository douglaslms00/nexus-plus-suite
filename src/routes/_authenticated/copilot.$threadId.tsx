import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { askCopilot } from "@/lib/copilot.functions";
import { Conversation, ConversationContent, ConversationEmptyState, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { PromptInput, PromptInputFooter, PromptInputSubmit, PromptInputTextarea } from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";

export const Route = createFileRoute("/_authenticated/copilot/$threadId")({ component: ThreadPage });

type Stored = { role: "user" | "assistant"; parts: { type: "text"; text: string }[] };

function ThreadPage() {
  const { threadId } = Route.useParams();
  return <ThreadChat key={threadId} threadId={threadId} />;
}

function ThreadChat({ threadId }: { threadId: string }) {
  const qc = useQueryClient();
  const ask = useServerFn(askCopilot);
  const [text, setText] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const msgs = useQuery({
    queryKey: ["copilot-messages", threadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("copilot_messages")
        .select("id,ui_message")
        .eq("thread_id", threadId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data.map((r) => ({ id: r.id, ...(r.ui_message as unknown as Stored) }));
    },
  });

  const send = useMutation({
    mutationFn: (t: string) => ask({ data: { threadId, text: t } }),
    onMutate: (t) => setPending(t),
    onSettled: async () => {
      await qc.invalidateQueries({ queryKey: ["copilot-messages", threadId] });
      qc.invalidateQueries({ queryKey: ["copilot-threads"] });
      setPending(null);
      inputRef.current?.focus();
    },
    onError: (e: Error) => toast.error(e.message || "Não foi possível conversar com o Copilot."),
  });

  useEffect(() => inputRef.current?.focus(), []);

  const list = msgs.data ?? [];
  const showPending = pending && !list.some((m) => m.role === "user" && m.parts[0]?.text === pending && m === list[list.length - 1]);

  return (
    <>
      <div className="flex items-center gap-2 border-b p-2 sm:hidden">
        <Link to="/copilot" className="flex items-center gap-1 text-sm text-muted-foreground">
          <ArrowLeft className="h-4 w-4" /> Conversas
        </Link>
      </div>
      <Conversation className="min-h-0">
        <ConversationContent className="mx-auto w-full max-w-3xl">
          {list.length === 0 && !pending && !msgs.isLoading && (
            <ConversationEmptyState
              title="Sobre o que vamos falar?"
              description="Pergunte sobre funcionários, documentos, relatórios ou estoque."
            />
          )}
          {list.map((m) => (
            <Message key={m.id} from={m.role}>
              <MessageContent>
                {m.role === "assistant" ? (
                  <MessageResponse>{m.parts.map((p) => p.text).join("")}</MessageResponse>
                ) : (
                  m.parts.map((p) => p.text).join("")
                )}
              </MessageContent>
            </Message>
          ))}
          {showPending && (
            <Message from="user">
              <MessageContent>{pending}</MessageContent>
            </Message>
          )}
          {send.isPending && (
            <Message from="assistant">
              <MessageContent>
                <Shimmer>Pensando…</Shimmer>
              </MessageContent>
            </Message>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      <div className="mx-auto w-full max-w-3xl p-3">
        <PromptInput
          onSubmit={(msg) => {
            const t = msg.text.trim();
            if (!t || send.isPending) return;
            setText("");
            send.mutate(t);
          }}
        >
          <PromptInputTextarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Escreva sua mensagem…"
          />
          <PromptInputFooter className="justify-end">
            <PromptInputSubmit status={send.isPending ? "submitted" : undefined} disabled={!text.trim() && !send.isPending} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </>
  );
}
