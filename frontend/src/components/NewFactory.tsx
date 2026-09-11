import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from './ui/dialog';
import { Btn, Notice } from './Primitives';
import { useSession } from '../state/SessionContext';
import { sectors } from '../domain/fixtures';
import type { Sector } from '../domain/types';
export const NewFactory = () => {
  const [open, setOpen] = useState(false), [name, setName] = useState(''), [city, setCity] = useState(''), [state, setState] = useState(''), [sector, setSector] = useState<Sector>('Steel');
  const { addFactory, factories } = useSession(), navigate = useNavigate();
  const duplicate = factories.some(f => f.name.toLowerCase() === name.trim().toLowerCase());
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Btn variant="primary" data-testid="add-factory">+ Add factory</Btn></DialogTrigger><DialogContent data-testid="new-factory-dialog" className="app-dialog"><DialogTitle data-testid="new-factory-title">Add a factory</DialogTitle><DialogDescription data-testid="new-factory-description">A new record in your current demonstration session.</DialogDescription><form className="form-stack" onSubmit={e => { e.preventDefault(); if (!name.trim() || !city.trim() || !state.trim() || duplicate) return; const id = addFactory(name, city, state, sector); setOpen(false); navigate(`/factories/${id}`); }}>
    <label>Factory name<input data-testid="new-factory-name" value={name} onChange={e => setName(e.target.value)} required maxLength={80} placeholder="e.g. Indore Manufacturing"/></label><div className="form-grid"><label>City<input data-testid="new-factory-city" value={city} onChange={e => setCity(e.target.value)} required maxLength={60}/></label><label>State<input data-testid="new-factory-state" value={state} onChange={e => setState(e.target.value)} required maxLength={60}/></label></div><label>Sector<select data-testid="new-factory-sector" value={sector} onChange={e => setSector(e.target.value as Sector)}>{sectors.map(s => <option key={s}>{s}</option>)}</select></label>
    {duplicate && <p role="alert" className="field-error" data-testid="factory-name-error">A factory with this name already exists.</p>}<Notice id="new-factory-baseline-notice">Starts as <strong>Awaiting baseline</strong>. No location, emissions, rankings, or recommendations are generated.</Notice><div className="dialog-actions"><Btn type="button" data-testid="cancel-new-factory" onClick={() => setOpen(false)}>Cancel</Btn><Btn type="submit" variant="primary" data-testid="save-new-factory" disabled={!name.trim() || !city.trim() || !state.trim() || duplicate}>Create factory</Btn></div></form></DialogContent></Dialog>;
};