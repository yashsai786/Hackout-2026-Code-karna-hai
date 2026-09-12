import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ChatMessage, ToolDef } from '../lib/openrouter';
import type { CopilotTurn, PendingAction, ToolContext, ToolRun } from '../copilot/types';
import type { Sector } from '../domain/types';
import { runAgent } from '../copilot/agent';
import { buildSystemPrompt } from '../copilot/prompt';
import { useSession } from './SessionContext';
import { useSettings } from './settings';
import { useChrome } from './ui';

export type CopilotMode = 'agent' | 'narrated' | 'disconnected';

type CopilotState = {
  turns: CopilotTurn[];
  running: boolean;
  streaming: string;
  toolNow: string;
  mode: CopilotMode;
  pending: PendingAction | null;
  error: string;
  announcement: string;
  send: (input: string) => void;
  stop: () => void;
  clear: () => void;
  confirmPending: () => void;
  declinePending: () => void;
};
const Ctx = createContext<CopilotState | null>(null);

const uid = () => crypto.randomUUID();
const PENDING_TTL_MS = 5 * 60 * 1000;
// Snake_case tool ids read badly to a screen reader.
const spoken = (name: string) => name.replace(/_/g, ' ');

export const CopilotProvider = ({ children }: { children: ReactNode }) => {
  // SessionContext also exposes a field called `settings` (alert preferences), so it is aliased.
  const { factories, ledger, intake, record, settings: _alertPrefs } = useSession();
  const openrouter = useSettings();
  const { copilotOpen } = useChrome();
  const navigate = useNavigate();

  const [turns, setTurns] = useState<CopilotTurn[]>([]);
  const [running, setRunning] = useState(false);
  const [streaming, setStreaming] = useState('');
  const [toolNow, setToolNow] = useState('');
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [error, setError] = useState('');
  const [announcement, setAnnouncement] = useState('');

  // Tools called in iteration four must not read a stale ledger.
  const sessionRef = useRef({ factories, ledger, intake });
  useEffect(() => {
    sessionRef.current = { factories, ledger, intake };
  }, [factories, ledger, intake]);

  const wireRef = useRef<ChatMessage[]>([]);
  const pendingRef = useRef<Map<string, PendingAction>>(new Map());
  const abortRef = useRef<AbortController | null>(null);
  const runningRef = useRef(false);

  const { ensureModels, runChat, connected, defaultModel, toolSupport } = openrouter;
  const mode: CopilotMode =
    !connected || !defaultModel ? 'disconnected' : toolSupport === 'no' ? 'narrated' : 'agent';

  // Warm the catalogue when the panel opens, not only when the Settings dialog does.
  useEffect(() => {
    if (copilotOpen && connected) ensureModels();
  }, [copilotOpen, connected, ensureModels]);

  const buildCtx = useCallback(
    (): ToolContext => ({
      ...sessionRef.current,
      actions: {
        navigate: path => navigate(path),
        selectFactory: id => navigate(`/?factory=${id}`),
        setView: v => {
          const params = new URLSearchParams();
          if (v.sector && v.sector !== 'all') params.set('sector', v.sector as Sector);
          if (v.ranking) params.set('rank', v.ranking);
          navigate(`/${params.toString() ? `?${params}` : ''}`);
        },
        record,
      },
      proposeAction: a => {
        const token = uid();
        const entry: PendingAction = { ...a, token, createdAt: Date.now() };
        pendingRef.current.clear(); // at most one proposal outstanding
        pendingRef.current.set(token, entry);
        setPending(entry);
        return { token };
      },
      consumePending: token => {
        const entry = pendingRef.current.get(token);
        if (!entry) return null;
        pendingRef.current.delete(token);
        if (Date.now() - entry.createdAt > PENDING_TTL_MS) return null;
        return entry;
      },
    }),
    [navigate, record],
  );

  const drive = useCallback(
    async (wire: ChatMessage[]) => {
      if (runningRef.current) return;
      runningRef.current = true;
      setRunning(true);
      setError('');
      setStreaming('');
      setToolNow('');
      setAnnouncement('Working.');
      const controller = new AbortController();
      abortRef.current = controller;
      const runs: ToolRun[] = [];
      let lastSpoken = 0;

      const chat = (messages: ChatMessage[], tools: ToolDef[] | undefined, signal?: AbortSignal) => {
        setStreaming('');
        return runChat({
          messages,
          tools,
          signal,
          onEvent: e => {
            if (e.type === 'text') setStreaming(prev => prev + e.delta);
          },
        });
      };

      try {
        const outcome = await runAgent(wire, {
          chat,
          ctx: buildCtx(),
          signal: controller.signal,
          toolsEnabled: mode === 'agent',
          onToolStart: run => {
            setToolNow(spoken(run.name));
            const now = Date.now();
            if (now - lastSpoken > 500) {
              lastSpoken = now;
              setAnnouncement(`Running ${spoken(run.name)}.`);
            }
          },
          onToolEnd: run => {
            runs.push(run);
            setToolNow('');
          },
        });
        wireRef.current = outcome.messages;
        const figures = runs.filter(r => r.ok).length;
        setTurns(t => [
          ...t,
          {
            id: uid(),
            role: 'assistant',
            text: outcome.text,
            toolRuns: runs,
            stopped: outcome.stopped,
            narrated: mode === 'narrated',
          },
        ]);
        setAnnouncement(
          outcome.stopped
            ? 'Generation stopped. Partial answer kept.'
            : `Answer complete. ${figures} tool ${figures === 1 ? 'result' : 'results'} cited.`,
        );
      } catch (e) {
        const message = e instanceof Error ? e.message : 'The model did not respond.';
        setError(message);
        setAnnouncement(message);
        // Never leave a malformed history behind for the next turn.
        wireRef.current = wireRef.current.filter(m => m.role !== 'tool');
      } finally {
        runningRef.current = false;
        setRunning(false);
        setStreaming('');
        setToolNow('');
        abortRef.current = null;
      }
    },
    [buildCtx, mode, runChat],
  );

  const send = useCallback(
    (input: string) => {
      const text = input.trim();
      if (!text || runningRef.current) return;
      setTurns(t => [...t, { id: uid(), role: 'user', text, toolRuns: [] }]);
      const system: ChatMessage = {
        role: 'system',
        content: buildSystemPrompt({ ...sessionRef.current, toolsEnabled: mode === 'agent' }),
      };
      const prior = wireRef.current.filter(m => m.role !== 'system');
      const wire: ChatMessage[] = [system, ...prior, { role: 'user', content: text }];
      wireRef.current = wire;
      void drive(wire);
    },
    [drive, mode],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    wireRef.current = [];
    pendingRef.current.clear();
    setTurns([]);
    setPending(null);
    setError('');
    setStreaming('');
    setAnnouncement('Conversation cleared.');
  }, []);

  // Confirmation round-trips through the model so the record id reaches the user from a tool
  // result and the transcript holds the full proposal → confirmation → execution trail.
  const confirmPending = useCallback(() => {
    const entry = pending;
    if (!entry || runningRef.current) return;
    setPending(null);
    const wire: ChatMessage[] = [
      ...wireRef.current,
      {
        role: 'user',
        content: `Confirmed. Execute record_estimate with confirmation_token "${entry.token}".`,
      },
    ];
    wireRef.current = wire;
    void drive(wire);
  }, [pending, drive]);

  const declinePending = useCallback(() => {
    const entry = pending;
    if (!entry) return;
    pendingRef.current.delete(entry.token);
    setPending(null);
    wireRef.current = [
      ...wireRef.current,
      { role: 'user', content: 'Declined. Do not record that estimate.' },
    ];
    setTurns(t => [
      ...t,
      { id: uid(), role: 'assistant', text: 'Understood — nothing was recorded.', toolRuns: [] },
    ]);
    setAnnouncement('Proposal declined. Nothing was recorded.');
  }, [pending]);

  const value: CopilotState = {
    turns,
    running,
    streaming,
    toolNow,
    mode,
    pending,
    error,
    announcement,
    send,
    stop,
    clear,
    confirmPending,
    declinePending,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const useCopilot = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('CopilotProvider missing');
  return c;
};
