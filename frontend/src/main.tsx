import React from 'react';
import ReactDOM from 'react-dom/client';
import { hydrateReference } from './domain/fixtures';
import { fetchReference } from './lib/leakpointApi';
import './index.css';
import './styles.css';
import './styles-accessibility.css';
import './styles-nav.css';
import './styles-copilot.css';

class Boundary extends React.Component<{ children: React.ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <main className="startup-error" data-testid="startup-error">
        <h1>Let’s start fresh.</h1>
        <p>The demonstration encountered a problem. Refresh to restore the validated dataset.</p>
        <button data-testid="startup-reload" onClick={() => window.location.reload()}>
          Restore demonstration
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}

// The factor table comes from the API. It is fetched before App is even imported, so no module can
// capture a stale built-in value; if the service is down within 2.5 s the built-ins stand in and the
// footer says so.
async function boot() {
  try {
    const ref = await Promise.race([
      fetchReference(),
      new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error('timeout')), 2500)),
    ]);
    hydrateReference(ref.reference, 'api');
  } catch {
    /* built-in factors remain */
  }
  const [{ default: App }, { validateFixtures }] = await Promise.all([
    import('./App.tsx'),
    import('./domain/validation'),
  ]);
  validateFixtures();
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <Boundary>
        <App />
      </Boundary>
    </React.StrictMode>,
  );
}
void boot();
