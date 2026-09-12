import { useEffect, useRef } from 'react';
import { AlertCircle, Cpu, Settings as SettingsIcon } from 'lucide-react';
import { Btn, Tag } from '../Primitives';
import { useCopilot } from '../../state/copilot';
import { useChrome } from '../../state/ui';
import { RichText } from './inline';
import { Evidence } from './Provenance';

const STARTERS = [
  'Where should I start across the portfolio, and what would it cost?',
  'Compare Bhilai Steel Works and Chandrapur Cement.',
  'What if I do waste heat recovery at Bhilai at 40% adoption?',
  'Show me the worst cement plant on the map.',
];

export const Transcript = () => {
  const { turns, running, streaming, toolNow, error, mode, send } = useCopilot();
  const { setSettingsOpen } = useChrome();
  const scroller = useRef<HTMLDivElement>(null);

  // Autoscroll only when the user is already at the bottom, and honour reduced motion (CSS cannot
  // cover scrollTo behaviour).
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight > 120) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({ top: el.scrollHeight, behavior: reduced ? 'auto' : 'smooth' });
  }, [turns, streaming, toolNow, error]);

  const cold = !turns.length && !running;

  return (
    <div className="copilot-transcript" data-testid="copilot-transcript" ref={scroller}
         tabIndex={0} role="group" aria-label={`Copilot conversation, ${turns.length} messages`}>
      {cold && (
        <div className="copilot-cold">
          <p className="copilot-cold-lead">
            Ask anything about this session. Every figure is computed by the same functions the screens use —
            never generated — and each answer shows the tools it ran.
          </p>
          {mode === 'disconnected'
            ? (
              <div className="copilot-connect" data-testid="copilot-connect">
                <span className="copilot-badge"><Cpu size={15} /></span>
                <div>
                  <strong>Connect a model to begin</strong>
                  <p>The Copilot uses the OpenRouter key from Settings. Figures always come from this session's calculator; the model only phrases them.</p>
                </div>
                <Btn data-testid="copilot-open-settings" onClick={() => setSettingsOpen(true)}><SettingsIcon size={14} />Connect</Btn>
              </div>
            )
            : (
              <div className="copilot-chips" data-testid="copilot-chips">
                {STARTERS.map(s => <button key={s} onClick={() => send(s)} data-testid={`copilot-chip-${s.slice(0, 12).toLowerCase().replace(/[^a-z]+/g, '-')}`}>{s}</button>)}
              </div>
            )}
        </div>
      )}

      {turns.map(turn => (
        <article className={`copilot-msg ${turn.role}`} key={turn.id} aria-label={turn.role === 'user' ? 'Your question' : 'Copilot answer'}>
          <div className="copilot-bubble">
            <RichText text={turn.text} />
            {turn.stopped && <Tag id={`copilot-stopped-${turn.id}`} tone="warning">Stopped</Tag>}
            {turn.narrated && <Tag id={`copilot-narrated-${turn.id}`} tone="warning">Model cannot call tools</Tag>}
          </div>
          {turn.role === 'assistant' && !!turn.toolRuns.length && (
            <>
              <Evidence runs={turn.toolRuns} />
              <Tag id={`copilot-illustrative-${turn.id}`} tone="blue">Illustrative estimate</Tag>
            </>
          )}
        </article>
      ))}

      {running && (streaming
        ? <article className="copilot-msg assistant" aria-label="Copilot answer in progress"><div className="copilot-bubble"><RichText text={streaming} /><span className="copilot-caret" aria-hidden="true" /></div></article>
        : <div className="copilot-running" data-testid="copilot-running"><span className="copilot-spinner" aria-hidden="true" />{toolNow ? <span>Running <code className="mono">{toolNow}</code>…</span> : <span>Thinking…</span>}</div>)}

      {running && streaming && toolNow && (
        <div className="copilot-running" data-testid="copilot-running-tool"><span className="copilot-spinner" aria-hidden="true" /><span>Running <code className="mono">{toolNow}</code>…</span></div>
      )}

      {error && (
        <div className="copilot-error" role="alert" data-testid="copilot-error">
          <AlertCircle size={15} aria-hidden="true" />
          <div><strong>The Copilot could not answer</strong><p>{error} Your session data is unchanged.</p></div>
        </div>
      )}
    </div>
  );
};
