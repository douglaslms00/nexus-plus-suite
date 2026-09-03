import { useEffect, useState, type ReactNode } from "react";
import { ObraCtx } from "./obra-context.types";

export function ObraProvider({ children }: { children: ReactNode }) {
  const [obraId, setObraIdState] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window !== "undefined") {
      setObraIdState(localStorage.getItem("obra_atual") || null);
    }
  }, []);
  const setObraId = (id: string | null) => {
    setObraIdState(id);
    if (typeof window !== "undefined") {
      if (id) localStorage.setItem("obra_atual", id);
      else localStorage.removeItem("obra_atual");
    }
  };
  return <ObraCtx.Provider value={{ obraId, setObraId }}>{children}</ObraCtx.Provider>;
}
