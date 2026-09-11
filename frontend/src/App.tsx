import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { SessionProvider } from './state/SessionContext';
import { UIProvider } from './state/ui';
import { SettingsProvider } from './state/settings';
import { Shell } from './components/Shell';
import { NotFound } from './components/Primitives';
import { Toaster } from './components/ui/sonner';
import CommandMap from './pages/CommandMap';
import Intake from './pages/Intake';
import Factories from './pages/Factories';
import FactoryDetail from './pages/FactoryDetail';
import Interventions from './pages/Interventions';
import InterventionDetail from './pages/InterventionDetail';
import Credits from './pages/Credits';
import Ledger from './pages/Ledger';
import Alerts from './pages/Alerts';
export default function App() {
  return <BrowserRouter><SessionProvider><UIProvider><SettingsProvider><Shell><Routes><Route path="/" element={<CommandMap/>}/><Route path="/intake" element={<Intake/>}/><Route path="/factories" element={<Factories/>}/><Route path="/factories/:id" element={<FactoryDetail/>}/><Route path="/interventions" element={<Interventions/>}/><Route path="/interventions/:id" element={<InterventionDetail/>}/><Route path="/credits" element={<Credits/>}/><Route path="/ledger" element={<Ledger/>}/><Route path="/alerts" element={<Alerts/>}/><Route path="*" element={<NotFound/>}/></Routes></Shell><Toaster position="bottom-right" theme="light"/></SettingsProvider></UIProvider></SessionProvider></BrowserRouter>;
}
