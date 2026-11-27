import { createFileRoute } from "@tanstack/react-router";
import { Bot } from "lucide-react";

export const Route = createFileRoute("/_authenticated/copilot/")({ component: CopilotEmpty });

function CopilotEmpty() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#0E1D40] text-white">
        <Bot className="h-6 w-6" />
      </div>
      <h2 className="font-semibold">Copilot GestãoPro</h2>
      <p className="max-w-sm text-sm text-muted-foreground">
        Crie uma conversa para cada assunto. Suas conversas ficam salvas na sua conta e só você pode vê-las.
      </p>
    </div>
  );
}
