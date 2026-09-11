import { useState } from 'react';
import { Settings, KeyRound, Cpu, Search, Check, Eye, EyeOff, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from './ui/dialog';
import { Btn, Tag } from './Primitives';
import { useSettings } from '../state/settings';

const tid = (id: string) => `model-${id.replace(/[^a-z0-9]+/gi, '-')}`;

export const SettingsDialog = () => {
  const { connected, keyInfo, models, modelsLoading, modelsError, defaultModel, setDefaultModel, connect, disconnect, loadModels } = useSettings();
  const [open, setOpen] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');

  const onOpenChange = (v: boolean) => { setOpen(v); if (v) loadModels(); };
  const handleConnect = async () => {
    setBusy(true); setError('');
    try { await connect(keyInput); toast.success('OpenRouter connected for this session.'); setKeyInput(''); setShow(false); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not validate the key.'); }
    finally { setBusy(false); }
  };

  const query = q.trim().toLowerCase();
  const filtered = query ? models.filter(m => m.id.toLowerCase().includes(query) || m.name.toLowerCase().includes(query)) : models;
  const shown = filtered.slice(0, 60);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <button className="nav-gear" aria-label="Open settings" data-testid="open-settings"><Settings size={18} />{connected && <i className="gear-dot" />}</button>
      </DialogTrigger>
      <DialogContent className="app-dialog settings-dialog" data-testid="settings-dialog">
        <DialogTitle data-testid="settings-title">Settings</DialogTitle>
        <DialogDescription data-testid="settings-description">Session-only preferences. Your key stays in this browser and clears on refresh.</DialogDescription>

        <div className="settings-body">
          <section className="settings-block" data-testid="settings-openrouter">
            <header>
              <span className="settings-block-ic"><KeyRound size={18} /></span>
              <div><h3>OpenRouter</h3><p>Bring your own key to power models from OpenAI, Anthropic, Google and more.</p></div>
              {connected && <Tag id="settings-connected" tone="success">Connected</Tag>}
            </header>

            {!connected ? (
              <>
                <label className="field-label" htmlFor="or-key">API key
                  <div className="key-field">
                    <input id="or-key" data-testid="openrouter-key-input" type={show ? 'text' : 'password'} value={keyInput} onChange={e => { setKeyInput(e.target.value); setError(''); }} placeholder="sk-or-v1-..." autoComplete="off" spellCheck={false} />
                    <button type="button" aria-label={show ? 'Hide key' : 'Show key'} data-testid="toggle-key-visibility" onClick={() => setShow(s => !s)}>{show ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                  </div>
                </label>
                <div className="settings-actions">
                  <Btn variant="primary" data-testid="connect-openrouter" disabled={busy || !keyInput.trim()} onClick={handleConnect}>{busy ? 'Connecting…' : 'Connect'}</Btn>
                  <a className="text-link" href="https://openrouter.ai/settings/keys" target="_blank" rel="noreferrer" data-testid="get-openrouter-key">Get a key<ExternalLink size={13} /></a>
                </div>
                {error && <p className="field-error" role="alert" data-testid="openrouter-error">{error}</p>}
              </>
            ) : (
              <>
                <div className="key-info" data-testid="openrouter-key-info">
                  <div><span className="settings-note">Status</span><strong>Active this session</strong></div>
                  {keyInfo?.usage != null && <div><span className="settings-note">Usage</span><strong>${keyInfo.usage.toFixed(2)}</strong></div>}
                  <div><span className="settings-note">Remaining</span><strong>{keyInfo?.limit_remaining != null ? `$${keyInfo.limit_remaining.toFixed(2)}` : 'Unlimited'}</strong></div>
                </div>
                <div className="settings-actions"><Btn data-testid="disconnect-openrouter" onClick={() => { disconnect(); toast.message('OpenRouter disconnected.'); }}>Disconnect</Btn></div>
              </>
            )}
          </section>

          <section className="settings-block" data-testid="settings-model">
            <header>
              <span className="settings-block-ic"><Cpu size={18} /></span>
              <div><h3>Default model</h3><p>{modelsLoading ? 'Loading the live catalogue…' : modelsError ? 'Could not load models.' : `${models.length} models available from OpenRouter.`}</p></div>
            </header>
            <div className="model-search"><Search size={16} /><input data-testid="model-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search models…" aria-label="Search models" /></div>
            <div className="model-list" data-testid="model-list">
              {modelsError ? <p className="model-empty">{modelsError} <button className="text-link" data-testid="retry-models" onClick={loadModels}>Retry</button></p>
                : shown.length === 0 ? <p className="model-empty">{modelsLoading ? 'Loading…' : 'No models match your search.'}</p>
                : shown.map(m => (
                  <button key={m.id} className={`model-row ${defaultModel === m.id ? 'selected' : ''}`} data-testid={tid(m.id)} onClick={() => setDefaultModel(m.id)}>
                    <div><strong>{m.name}</strong><span>{m.id}</span></div>
                    {defaultModel === m.id && <Check size={16} />}
                  </button>
                ))}
            </div>
            {filtered.length > shown.length && <p className="settings-note settings-more">Showing first {shown.length} of {filtered.length}. Refine your search to see more.</p>}
            <p className="model-current" data-testid="default-model">Default model: <strong>{defaultModel || 'none selected'}</strong></p>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
};
