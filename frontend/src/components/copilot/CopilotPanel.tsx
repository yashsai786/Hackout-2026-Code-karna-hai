import { useEffect, useRef } from 'react';
import { RotateCcw, Sparkles, X } from 'lucide-react';
import { Tag } from '../Primitives';
import { useChrome } from '../../state/ui';
import { useCopilot } from '../../state/copilot';
import { useSettings } from '../../state/settings';
import { Transcript } from './Transcript';
import { Composer } from './Composer';
import { RecordDialog } from './RecordDialog';

export default function CopilotPanel({
  launcherRef,
}: {
  launcherRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const { copilotOpen, setCopilotOpen } = useChrome();
  const { clear, mode } = useCopilot();
  const { defaultModel } = useSettings();
  const panel = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!copilotOpen) return;
    (panel.current?.querySelector('#copilot-input') as HTMLTextAreaElement | null)?.focus();
  }, [copilotOpen]);

  // Radix handles Escape first when the record dialog is open, so bail if it already acted.
  useEffect(() => {
    if (!copilotOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      setCopilotOpen(false);
      launcherRef.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [copilotOpen, setCopilotOpen, launcherRef]);

  const modeLabel =
    mode === 'agent'
      ? 'Grounded in this session'
      : mode === 'narrated'
        ? 'Model cannot call tools'
        : 'No model connected';

  return (
    <>
      <aside
        ref={panel}
        id="copilot-panel"
        className={`copilot-panel ${copilotOpen ? 'open' : ''}`}
        data-testid="copilot-panel"
        aria-label="Leakpoint Copilot"
        aria-hidden={!copilotOpen}
        inert={!copilotOpen || undefined}
      >
        <div className="copilot-head">
          <div className="copilot-head-main">
            <span className="copilot-badge">
              <Sparkles size={16} />
            </span>
            <div>
              <div className="eyebrow">YOUR DATA, INTERROGATED</div>
              <h2 data-testid="copilot-title">Copilot</h2>
            </div>
          </div>
          <div className="copilot-head-actions">
            <button
              className="copilot-icon"
              aria-label="Clear the conversation"
              title="Clear conversation"
              data-testid="copilot-clear"
              onClick={clear}
            >
              <RotateCcw size={14} />
            </button>
            <button
              className="copilot-icon"
              aria-label="Close the Copilot"
              title="Close"
              data-testid="copilot-close"
              onClick={() => {
                setCopilotOpen(false);
                launcherRef.current?.focus();
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="copilot-mode" data-testid="copilot-mode">
          <Tag id="copilot-mode-tag" tone={mode === 'agent' ? 'success' : 'warning'}>
            {modeLabel}
          </Tag>
          <span className="mono" data-testid="copilot-model">
            {defaultModel || 'no model'}
          </span>
        </div>

        <Transcript />

        <div className="copilot-foot">
          <Composer />
        </div>
      </aside>
      <RecordDialog />
    </>
  );
}
