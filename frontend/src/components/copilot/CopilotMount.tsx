import { Suspense, lazy, useRef } from 'react';
import { Sparkles, X } from 'lucide-react';
import { useChrome } from '../../state/ui';
import { useCopilot } from '../../state/copilot';

// Lazy so Recharts-free chat code and its markup stay out of the entry chunk.
const CopilotPanel = lazy(() => import('./CopilotPanel'));

export const CopilotMount = () => {
  const { copilotOpen, setCopilotOpen } = useChrome();
  const { announcement, error } = useCopilot();
  const launcher = useRef<HTMLButtonElement>(null);

  return (
    <>
      {/* Announcers live OUTSIDE the panel: aria-hidden + inert would silence a live region inside
          it, so a stream finishing while closed could never be announced. */}
      <p className="sr-only" role="status" data-testid="copilot-announcer">{announcement}</p>
      <p className="sr-only" role="alert" data-testid="copilot-alert">{error}</p>

      <button
        ref={launcher}
        className={`copilot-launcher ${copilotOpen ? 'is-open' : ''}`}
        data-testid="copilot-launcher"
        aria-expanded={copilotOpen}
        aria-controls="copilot-panel"
        aria-label={copilotOpen ? 'Close the Copilot' : 'Open the Copilot'}
        onClick={() => setCopilotOpen(!copilotOpen)}
      >
        {copilotOpen ? <X size={18} /> : <><Sparkles size={17} /><span className="copilot-launcher-text">Copilot</span></>}
      </button>

      <Suspense fallback={null}>
        <CopilotPanel launcherRef={launcher} />
      </Suspense>
    </>
  );
};
