import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import {
  validateKey,
  fetchModels,
  streamChat,
  supportsTools,
  type KeyInfo,
  type Model,
  type StreamChatOptions,
  type StreamResult,
} from '../lib/openrouter';
import { fetchSettings, saveSettings, deleteSettings, apiConfigured } from '../lib/leakpointApi';

export type ToolSupport = 'yes' | 'no' | 'unknown';
type ChatArgs = Omit<StreamChatOptions, 'apiKey' | 'model'> & { model?: string };

type SettingsState = {
  connected: boolean;
  /** True once the key and model are known to be stored on the API. */
  persisted: boolean;
  restoring: boolean;
  keyInfo: KeyInfo | null;
  models: Model[];
  modelsLoading: boolean;
  modelsError: string;
  defaultModel: string;
  setDefaultModel: (id: string) => void;
  connect: (key: string) => Promise<void>;
  disconnect: () => void;
  loadModels: () => Promise<void>;
  ensureModels: () => Promise<void>;
  toolSupport: ToolSupport;
  toolModelCount: number;
  runChat: (args: ChatArgs) => Promise<StreamResult>;
};
const Ctx = createContext<SettingsState | null>(null);

// Verified present in the live catalogue and tool-capable. Best effort: if none match, the picker
// falls through to the cheapest capable model.
const PREFERRED_MODELS = [
  'google/gemini-2.5-flash',
  'openai/gpt-4.1-mini',
  'anthropic/claude-haiku-4.5',
  'openai/gpt-4o-mini',
  'anthropic/claude-sonnet-4.5',
];

const promptPrice = (m: Model) => {
  const n = Number(m.pricing?.prompt ?? '1');
  return Number.isFinite(n) && n >= 0 ? n : Number.POSITIVE_INFINITY;
};

export function pickDefaultModel(models: Model[], keyInfo: KeyInfo | null): string {
  const capable = models.filter(supportsTools);
  if (!capable.length) return '';
  const free = capable.filter(m => m.id.endsWith(':free') || m.pricing?.prompt === '0');
  const pool = keyInfo?.is_free_tier && free.length ? free : capable;
  for (const id of PREFERRED_MODELS) {
    const hit = pool.find(m => m.id === id);
    if (hit) return hit.id;
  }
  return [...pool].sort((a, b) => promptPrice(a) - promptPrice(b))[0]?.id ?? capable[0].id;
}

export const SettingsProvider = ({ children }: { children: ReactNode }) => {
  // A ref, not state: runChat must read the current key from a stable callback without a stale
  // closure. This is about correctness, not concealment — it is no more hidden from DevTools.
  const keyRef = useRef('');
  const [keyInfo, setKeyInfo] = useState<KeyInfo | null>(null);
  const [models, setModels] = useState<Model[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState('');
  const [defaultModel, setDefaultModelState] = useState('');
  const defaultModelRef = useRef('');
  const requested = useRef(false);

  const [persisted, setPersisted] = useState(false);
  const [restoring, setRestoring] = useState(apiConfigured());

  const setDefaultModel = useCallback((id: string) => {
    defaultModelRef.current = id;
    setDefaultModelState(id);
    // Write through so the choice survives a refresh. Failure is silent: the choice still works now.
    if (apiConfigured() && id)
      saveSettings({ default_model: id }).then(
        () => setPersisted(true),
        () => setPersisted(false),
      );
  }, []);

  // Plain async with a ref guard. The previous shape ran its fetch inside a setModels updater,
  // which React StrictMode may invoke twice.
  const loadModels = useCallback(async () => {
    if (requested.current) return;
    requested.current = true;
    setModelsLoading(true);
    setModelsError('');
    try {
      setModels(await fetchModels());
    } catch (e) {
      requested.current = false; // so the Retry button can try again
      setModelsError(e instanceof Error ? e.message : 'Could not load models.');
    } finally {
      setModelsLoading(false);
    }
  }, []);

  const connect = useCallback(
    async (key: string, options: { persist?: boolean } = {}) => {
      const info = await validateKey(key);
      keyRef.current = key.trim();
      setKeyInfo(info);
      loadModels();
      if (options.persist !== false && apiConfigured()) {
        try {
          await saveSettings({ openrouter_key: key.trim() });
          setPersisted(true);
        } catch {
          setPersisted(false);
        }
      }
    },
    [loadModels],
  );

  const disconnect = useCallback(() => {
    keyRef.current = '';
    setKeyInfo(null);
    setDefaultModelState('');
    defaultModelRef.current = '';
    setPersisted(false);
    if (apiConfigured()) deleteSettings().catch(() => undefined);
  }, []);

  // Restore the stored key and model once on start. A rejected key is dropped rather than retried,
  // so a revoked key cannot leave the app reconnecting forever.
  useEffect(() => {
    if (!apiConfigured()) return;
    let cancelled = false;
    (async () => {
      try {
        const saved = await fetchSettings();
        if (cancelled || !saved.has_key || !saved.openrouter_key) return;
        if (saved.default_model) {
          defaultModelRef.current = saved.default_model;
          setDefaultModelState(saved.default_model);
        }
        await connect(saved.openrouter_key, { persist: false });
        if (!cancelled) setPersisted(true);
      } catch {
        /* no API, or the saved key no longer validates: start disconnected */
      } finally {
        if (!cancelled) setRestoring(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runChat = useCallback(async (o: ChatArgs) => {
    const apiKey = keyRef.current;
    if (!apiKey) throw new Error('Connect an OpenRouter key in Settings to use the Copilot.');
    const model = o.model || defaultModelRef.current;
    if (!model) throw new Error('Choose a default model in Settings.');
    return streamChat({ ...o, apiKey, model });
  }, []);

  const connected = !!keyInfo;

  // Idempotent: only writes when nothing is selected, so StrictMode's double run is harmless.
  // It lives in an effect rather than connect() because connect only *starts* the catalogue fetch.
  useEffect(() => {
    if (!connected || defaultModel || !models.length) return;
    const pick = pickDefaultModel(models, keyInfo);
    if (pick) setDefaultModel(pick);
  }, [connected, defaultModel, models, keyInfo, setDefaultModel]);

  const selected = models.find(m => m.id === defaultModel);
  // Tri-state: before the catalogue loads, capability is genuinely unknown, and claiming "cannot
  // call tools" would be a false statement in a product built on not making those.
  const toolSupport: ToolSupport = !models.length
    ? 'unknown'
    : !defaultModel
      ? 'unknown'
      : selected
        ? supportsTools(selected)
          ? 'yes'
          : 'no'
        : 'unknown';
  const toolModelCount = models.filter(supportsTools).length;

  const value: SettingsState = {
    connected,
    persisted,
    restoring,
    keyInfo,
    models,
    modelsLoading,
    modelsError,
    defaultModel,
    setDefaultModel,
    connect,
    disconnect,
    loadModels,
    ensureModels: loadModels,
    toolSupport,
    toolModelCount,
    runChat,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const useSettings = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('SettingsProvider missing');
  return c;
};
