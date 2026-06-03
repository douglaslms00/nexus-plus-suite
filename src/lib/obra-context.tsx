import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Ctx = { obraId: string | null; setObraId: (id: string | null) => void };
const ObraCtx = createContext<Ctx>({ obraId: null, setObraId: () => {} });

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

export const useObraAtual = () => useContext(ObraCtx);
