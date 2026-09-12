import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { SessionProvider } from './state/SessionContext';
import { UIProvider } from './state/ui';
import { SettingsProvider } from './state/settings';
import { Shell } from './components/Shell';
import { NotFound } from './components/Primitives';
import { Toaster } from 'sonner';
import { CopilotProvider } from './state/copilot';
import { CopilotMount } from './components/copilot/CopilotMount';
// Split per route so Leaflet (Command Map) and Recharts (detail pages) stay out of the entry chunk.
const CommandMap = lazy(() => import('./pages/CommandMap'));
const Intake = lazy(() => import('./pages/Intake'));
const Factories = lazy(() => import('./pages/Factories'));
const FactoryDetail = lazy(() => import('./pages/FactoryDetail'));
const FactoryProfile = lazy(() => import('./pages/FactoryProfile'));
const Interventions = lazy(() => import('./pages/Interventions'));
const InterventionDetail = lazy(() => import('./pages/InterventionDetail'));
const Credits = lazy(() => import('./pages/Credits'));
const Ledger = lazy(() => import('./pages/Ledger'));
const Alerts = lazy(() => import('./pages/Alerts'));
const RouteFallback = () => (
  <div className="route-loading" role="status" aria-live="polite" data-testid="route-loading">
    <span />
    Loading…
  </div>
);
export default function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <UIProvider>
          <SettingsProvider>
            <CopilotProvider>
              <Shell>
                <Suspense fallback={<RouteFallback />}>
                  <Routes>
                    <Route path="/" element={<CommandMap />} />
                    <Route path="/intake" element={<Intake />} />
                    <Route path="/factories" element={<Factories />} />
                    <Route path="/factories/:id" element={<FactoryDetail />} />
                    <Route path="/factories/:id/profile" element={<FactoryProfile />} />
                    <Route path="/interventions" element={<Interventions />} />
                    <Route path="/interventions/:id" element={<InterventionDetail />} />
                    <Route path="/credits" element={<Credits />} />
                    <Route path="/ledger" element={<Ledger />} />
                    <Route path="/alerts" element={<Alerts />} />
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </Suspense>
              </Shell>
              <CopilotMount />
              <Toaster
                position="bottom-right"
                theme="light"
                offset={{ bottom: '92px', right: '24px' }}
                mobileOffset={{ bottom: '76px', left: '16px', right: '16px' }}
              />
            </CopilotProvider>
          </SettingsProvider>
        </UIProvider>
      </SessionProvider>
    </BrowserRouter>
  );
}
