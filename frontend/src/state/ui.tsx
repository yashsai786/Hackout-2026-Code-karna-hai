import { createContext, useContext, useState, type ReactNode } from 'react';
type UI = {
  panelOpen: boolean;
  setPanelOpen: (v: boolean) => void;
  // Lifted out of SettingsDialog so the Copilot can send the user there to connect a model.
  settingsOpen: boolean;
  setSettingsOpen: (v: boolean) => void;
  copilotOpen: boolean;
  setCopilotOpen: (v: boolean) => void;
};
const Ctx = createContext<UI | null>(null);
export const UIProvider = ({ children }: { children: ReactNode }) => {
  const [panelOpen, setPanelOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  return (
    <Ctx.Provider
      value={{ panelOpen, setPanelOpen, settingsOpen, setSettingsOpen, copilotOpen, setCopilotOpen }}
    >
      {children}
    </Ctx.Provider>
  );
};
const useUI = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('UIProvider missing');
  return c;
};
export const useMapPanel = useUI;
export const useChrome = useUI;
