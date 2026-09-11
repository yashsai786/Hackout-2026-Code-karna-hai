import { useEffect, useRef, useState } from 'react';
import { CornerDownLeft, Mic, Search, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { parseCommand } from '../domain/commands';
import type { Factory, Sector } from '../domain/types';
import { Btn } from './Primitives';
export const CommandBar = ({ factories, select, filter, rank, reset }: { factories: Factory[]; select: (id: string) => void; filter: (sector: Sector) => void; rank: (v: 'total' | 'intensity') => void; reset: () => void }) => {
  const [text, setText] = useState(''), [message, setMessage] = useState(''), [choices, setChoices] = useState<string[]>([]), [listening, setListening] = useState(false);
  const recognition = useRef<any>(null), navigate = useNavigate();
  useEffect(() => () => { if (recognition.current) { recognition.current.onend = null; recognition.current.onerror = null; recognition.current.onresult = null; recognition.current.abort(); } }, []);
  function run(input: string) {
    setChoices([]); const result = parseCommand(input, factories);
    if (result.type === 'route') navigate(result.path);
    else if (result.type === 'factory') { select(result.id); setMessage(`Selected ${factories.find(f => f.id === result.id)?.name}.`); }
    else if (result.type === 'sector') { filter(result.sector); setMessage(`Showing ${result.sector.toLowerCase()} factories.`); }
    else if (result.type === 'rank') { rank(result.rank); setMessage(`Ranked by ${result.rank === 'total' ? 'annual emissions' : 'emissions intensity'}.`); }
    else if (result.type === 'clear') { reset(); setMessage('All factory filters cleared.'); }
    else if (result.type === 'ambiguous') { setChoices(result.ids); setMessage('More than one match. Choose a factory:'); }
    else setMessage('No rule matched. Try “Find Bhilai”, “Show cement factories”, “Highest intensity”, or “Go to ledger”.');
  }
  function voice() {
    if (listening) { recognition.current?.stop(); setListening(false); return; }
    const Speech = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Speech) { setMessage('Voice input is not supported in this browser. Typed commands are always available.'); return; }
    try {
      const r = new Speech(); recognition.current = r; r.lang = 'en-IN'; r.continuous = false;
      r.onresult = (e: any) => { const input = e.results[0][0].transcript; setText(input); run(input); };
      r.onerror = (e: any) => { setListening(false); setMessage(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'Microphone access was denied. Type your command instead.' : 'Voice input is unavailable. Type your command instead.'); };
      r.onend = () => setListening(false); r.start(); setListening(true); setMessage('Listening…');
    } catch { setListening(false); setMessage('Microphone could not start. Type your command instead.'); }
  }
  return <div className="command-section"><form className="command-bar" onSubmit={e => { e.preventDefault(); run(text); }} data-testid="command-form"><Search size={20} strokeWidth={1.7}/><label className="sr-only" htmlFor="command">Rule-based navigation command</label><input id="command" data-testid="command-input" value={text} onChange={e => setText(e.target.value)} placeholder="Find a factory, explore a sector, or go somewhere…" autoComplete="off"/><span className="command-rule" data-testid="command-rule-label">Rule-based navigation</span><button type="button" className={`command-mic ${listening ? 'listening' : ''}`} title={listening ? 'Stop listening' : 'Voice command'} aria-label={listening ? 'Stop listening' : 'Start voice command'} data-testid="voice-command" onClick={voice}><Mic size={18}/></button><button type="submit" className="command-submit" aria-label="Run command" title="Run command" data-testid="command-submit"><CornerDownLeft size={17}/></button></form>
    <div className="command-suggestions"><span>QUICK COMMANDS</span>{['Highest emissions', 'Show cement factories', 'Go to ledger'].map((s, i) => <button key={s} data-testid={`quick-command-${i}`} onClick={() => { setText(s); run(s); }}>{s}<ArrowIcon/></button>)}</div>
    {message && <div className="command-feedback" role="status" data-testid="command-feedback"><span>{message}</span><Btn className="icon-btn" variant="ghost" aria-label="Dismiss command message" data-testid="dismiss-command-message" onClick={() => { setMessage(''); setChoices([]); }}><X size={14}/></Btn></div>}
    {choices.length > 0 && <div className="command-choices">{choices.map(id => <Btn key={id} data-testid={`command-choice-${id}`} onClick={() => { select(id); setChoices([]); setMessage(`Selected ${factories.find(f => f.id === id)?.name}.`); }}>{factories.find(f => f.id === id)?.name}</Btn>)}</div>}
  </div>;
};
const ArrowIcon = () => <span aria-hidden="true">↗</span>;