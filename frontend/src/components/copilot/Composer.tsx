import { useEffect, useRef, useState } from 'react';
import { CornerDownLeft, Mic, Square } from 'lucide-react';
import { useCopilot } from '../../state/copilot';

export const Composer = () => {
  const { send, stop, running } = useCopilot();
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const [voiceNote, setVoiceNote] = useState('');
  const area = useRef<HTMLTextAreaElement>(null);
  const recognition = useRef<any>(null);

  // Null the handlers before abort so StrictMode's double-mount cannot surface a spurious error.
  useEffect(() => () => {
    const r = recognition.current;
    if (r) { r.onend = null; r.onerror = null; r.onresult = null; r.abort(); }
  }, []);

  const grow = () => { const el = area.current; if (el) { el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 112)}px`; } };
  useEffect(grow, [text]);

  const submit = () => { if (!text.trim() || running) return; send(text); setText(''); };

  const voice = () => {
    if (listening) { recognition.current?.stop(); setListening(false); return; }
    const Speech = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Speech) { setVoiceNote('Voice input is not supported in this browser. Type your question instead.'); return; }
    try {
      const r = new Speech(); recognition.current = r; r.lang = 'en-IN'; r.continuous = false;
      r.onresult = (e: any) => { setText(e.results[0][0].transcript); setVoiceNote(''); };
      r.onerror = (e: any) => { setListening(false); setVoiceNote(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'Microphone access was denied. Type your question instead.' : 'Voice input is unavailable. Type your question instead.'); };
      r.onend = () => setListening(false);
      r.start(); setListening(true); setVoiceNote('Listening…');
    } catch { setListening(false); setVoiceNote('The microphone could not start. Type your question instead.'); }
  };

  return (
    <>
      <form className="command-bar copilot-composer" data-testid="copilot-form" onSubmit={e => { e.preventDefault(); submit(); }}>
        <label className="sr-only" htmlFor="copilot-input">Ask the Copilot about this session</label>
        <textarea
          id="copilot-input" ref={area} rows={1} value={text} data-testid="copilot-input"
          placeholder="Ask about factories, scenarios, credits or the ledger…"
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
        />
        <button type="button" className={`command-mic ${listening ? 'listening' : ''}`} title={listening ? 'Stop listening' : 'Voice question'}
                aria-label={listening ? 'Stop listening' : 'Start a voice question'} data-testid="copilot-voice" onClick={voice}>
          <Mic size={17} />
        </button>
        {running
          ? <button type="button" className="command-submit copilot-stop" title="Stop generating" aria-label="Stop generating" data-testid="copilot-stop" onClick={stop}><Square size={13} /></button>
          : <button type="submit" className="command-submit" title="Send question" aria-label="Send question" data-testid="copilot-send" disabled={!text.trim()}><CornerDownLeft size={16} /></button>}
      </form>
      {voiceNote && <p className="copilot-voice-note" role="status" data-testid="copilot-voice-note">{voiceNote}</p>}
    </>
  );
};
