import { useState, type ReactNode } from "react";
import { ObraCtx } from "./obra-context.types";

export function ObraProvider({ children }: { children: ReactNode }) {
  // Inicialização lazy evita flash "Todas as obras" -> obra salva.
  const [obraId, setObraIdState] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      return localStorage.getItem("obra_atual") || null;
    } catch {
      return null;
    }
  });
  const setObraId = (id: string | null) => {
    setObraIdState(id);
    if (typeof window !== "undefined") {
      if (id) localStorage.setItem("obra_atual", id);
      else localStorage.removeItem("obra_atual");
    }
  };
  return <ObraCtx.Provider value={{ obraId, setObraId }}>{children}</ObraCtx.Provider>;
}
