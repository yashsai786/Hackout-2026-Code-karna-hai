import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { validateKey, fetchModels, type KeyInfo, type Model } from '../lib/openrouter';

type SettingsState = {
  connected: boolean; keyInfo: KeyInfo | null;
  models: Model[]; modelsLoading: boolean; modelsError: string;
  defaultModel: string; setDefaultModel: (id: string) => void;
  connect: (key: string) => Promise<void>; disconnect: () => void; loadModels: () => Promise<void>;
};
const Ctx = createContext<SettingsState | null>(null);

export const SettingsProvider = ({ children }: { children: ReactNode }) => {
  // Session-only: the key is never persisted and never sent to our servers. Refresh clears it.
  const [apiKey, setApiKey] = useState('');
  const [keyInfo, setKeyInfo] = useState<KeyInfo | null>(null);
  const [models, setModels] = useState<Model[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState('');
  const [defaultModel, setDefaultModel] = useState('');

  const loadModels = useCallback(async () => {
    setModels(current => {
      if (current.length) return current;
      setModelsLoading(true); setModelsError('');
      fetchModels()
        .then(list => setModels(list))
        .catch(e => setModelsError(e instanceof Error ? e.message : 'Could not load models.'))
        .finally(() => setModelsLoading(false));
      return current;
    });
  }, []);

  const connect = useCallback(async (key: string) => {
    const info = await validateKey(key);
    setApiKey(key.trim());
    setKeyInfo(info);
    loadModels();
  }, [loadModels]);

  const disconnect = useCallback(() => { setApiKey(''); setKeyInfo(null); }, []);

  void apiKey; // held in memory only; consumed by future inference calls
  const value: SettingsState = { connected: !!keyInfo, keyInfo, models, modelsLoading, modelsError, defaultModel, setDefaultModel, connect, disconnect, loadModels };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const useSettings = () => { const c = useContext(Ctx); if (!c) throw new Error('SettingsProvider missing'); return c; };
