import { Link } from 'react-router-dom';
import { ArrowUpRight, ChevronDown } from 'lucide-react';
import type { ToolRun } from '../../copilot/types';

const spoken = (name: string) => name.replace(/_/g, ' ');

/**
 * The evidence strip is the credibility surface: which tools ran, with what arguments, the real
 * formula, and a link to the screen that proves each figure. Native <details> so it is keyboard
 * accessible with no JavaScript and no extra axe risk.
 */
export const Evidence = ({ runs }: { runs: ToolRun[] }) => {
  if (!runs.length) return null;
  return (
    <div className="copilot-evidence" data-testid="copilot-evidence">
      <span className="copilot-section-label">Evidence</span>
      {runs.map(run => (
        <details className="copilot-trace" key={run.id} data-testid={`copilot-trace-${run.name}`}>
          <summary>
            <code className="mono">{spoken(run.name)}</code>
            {!run.ok && <span className="copilot-trace-bad">failed</span>}
            <span className="copilot-trace-ms">{run.ms} ms</span>
            <ChevronDown size={12} aria-hidden="true" />
          </summary>
          <div className="copilot-trace-body">
            {!!Object.keys(run.args).length && (
              <dl className="copilot-args">
                {Object.entries(run.args).map(([k, v]) => (
                  <div key={k}><dt>{k}</dt><dd>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</dd></div>
                ))}
              </dl>
            )}
            {run.error && <p className="copilot-trace-error">{run.error}</p>}
            {run.formula && <p className="copilot-formula mono">{run.formula}</p>}
            {!!run.refs.length && (
              <div className="copilot-trace-refs">
                {run.refs.map(r => (
                  <Link key={`${r.kind}-${r.id}`} to={r.to} className="text-link" data-testid={`copilot-ref-${r.id}`}>
                    {r.label}<ArrowUpRight size={13} aria-hidden="true" />
                  </Link>
                ))}
              </div>
            )}
          </div>
        </details>
      ))}
    </div>
  );
};
