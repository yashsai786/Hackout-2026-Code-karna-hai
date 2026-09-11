import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import { validateFixtures } from './domain/validation';
import './index.css';
import './styles.css';
import './styles-accessibility.css';
import './styles-nav.css';

class Boundary extends React.Component<{ children: React.ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  render() { return this.state.error ? <main className="startup-error" data-testid="startup-error"><h1>Let’s start fresh.</h1><p>The demonstration encountered a problem. Refresh to restore the validated dataset.</p><button data-testid="startup-reload" onClick={() => window.location.reload()}>Restore demonstration</button></main> : this.props.children; }
}
function ValidatedApp() { validateFixtures(); return <App/>; }
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><Boundary><ValidatedApp/></Boundary></React.StrictMode>);