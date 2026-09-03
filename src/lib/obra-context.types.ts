import { createContext, useContext, type ReactNode } from "react";

type Ctx = { obraId: string | null; setObraId: (id: string | null) => void };
const ObraCtx = createContext<Ctx>({ obraId: null, setObraId: () => {} });

export const useObraAtual = () => useContext(ObraCtx);
export { ObraCtx };
