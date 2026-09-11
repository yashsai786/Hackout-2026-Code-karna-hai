import { createContext, useContext, useState, type ReactNode } from 'react';
type UI = { panelOpen: boolean; setPanelOpen: (v: boolean) => void };
const Ctx = createContext<UI | null>(null);
export const UIProvider = ({ children }: { children: ReactNode }) => {
  const [panelOpen, setPanelOpen] = useState(true);
  return <Ctx.Provider value={{ panelOpen, setPanelOpen }}>{children}</Ctx.Provider>;
};
export const useMapPanel = () => { const c = useContext(Ctx); if (!c) throw new Error('UIProvider missing'); return c; };
