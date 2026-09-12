import { useEffect, useRef, useState } from 'react';
import { CornerDownLeft, Mic, Search, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  parseCommand,
  resultFromIntent,
  extractIntent,
  intentPrompt,
  type CommandResult,
} from '../domain/commands';
import { useSettings } from '../state/settings';
import { useChrome } from '../state/ui';
import { useCopilot } from '../state/copilot';
import type { GeoLayerId } from '../domain/geo';
import type { Factory, Sector } from '../domain/types';
import { Btn } from './Primitives';
export const CommandBar = ({
  factories,
  select,
  filter,
  rank,
  reset,
  filterState,
  setLayers,
  mapControl,
}: {
  factories: Factory[];
  select: (id: string) => void;
  filter: (sector: Sector) => void;
  rank: (v: 'total' | 'intensity') => void;
  reset: () => void;
  filterState: (state: string) => void;
  setLayers: (layers: GeoLayerId[], mode: 'set' | 'add' | 'remove' | 'clear') => void;
  mapControl: (action: 'zoom-in' | 'zoom-out' | 'fit') => void;
}) => {
  const [text, setText] = useState(''),
    [message, setMessage] = useState(''),
    [choices, setChoices] = useState<string[]>([]),
    [listening, setListening] = useState(false);
  const recognition = useRef<any>(null),
    navigate = useNavigate();
  const { connected, runChat } = useSettings();
  const { setPanelOpen, setCopilotOpen } = useChrome();
  const copilot = useCopilot();
  const [thinking, setThinking] = useState(false);
  useEffect(
    () => () => {
      if (recognition.current) {
        recognition.current.onend = null;
        recognition.current.onerror = null;
        recognition.current.onresult = null;
        recognition.current.abort();
      }
    },
    [],
  );
  // Rules first — deterministic and offline. Only what they cannot place goes to the model behind
  // the Settings key, and the model may only choose from targets we list; see resultFromIntent.
  async function run(input: string) {
    setChoices([]);
    const ruled = parseCommand(input, factories);
    if (ruled.type !== 'unknown') return apply(ruled);
    if (!connected) {
      setMessage(
        'No rule matched. Connect an OpenRouter key in Settings to say it any way you like, or try “Find Bhilai”, “Show solar and wind”, “Highest intensity”, or “Go to ledger”.',
      );
      return;
    }
    setThinking(true);
    setMessage('Asking the model…');
    try {
      const reply = await runChat({
        messages: [
          { role: 'system', content: intentPrompt(factories) },
          { role: 'user', content: input },
        ],
        toolChoice: 'none',
        temperature: 0,
        // Reasoning models spend tokens before the JSON appears; a tight cap returned nothing at all.
        maxTokens: 400,
      });
      const intent = extractIntent(reply.text);
      // Visible in DevTools so a misread request can be diagnosed without guessing.
      console.debug(
        '[navigate] model reply',
        JSON.stringify(reply.text),
        'finish',
        reply.finish,
        'usage',
        reply.usage,
        '→ intent',
        intent,
      );
      const result = resultFromIntent(intent, factories);
      if (result.type === 'unknown') {
        if (!reply.text.trim() || reply.finish === 'length') {
          // The model ran out of budget or returned nothing: the Copilot has tools and a larger
          // budget, so the request is handed on rather than dropped.
          apply({ type: 'copilot', question: input.trim() });
          return;
        }
        setMessage(
          'That does not map to anything on the map or the screens. Name a factory, sector, layer or page, or ask a question for the Copilot.',
        );
      } else apply(result);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'The model could not be reached.');
    } finally {
      setThinking(false);
    }
  }
  function apply(result: CommandResult) {
    if (result.type === 'route') navigate(result.path);
    else if (result.type === 'factory') {
      select(result.id);
      setMessage(`Selected ${factories.find(f => f.id === result.id)?.name}.`);
    } else if (result.type === 'sector') {
      filter(result.sector);
      setMessage(`Showing ${result.sector.toLowerCase()} factories.`);
    } else if (result.type === 'rank') {
      rank(result.rank);
      setMessage(`Ranked by ${result.rank === 'total' ? 'annual emissions' : 'emissions intensity'}.`);
    } else if (result.type === 'state') {
      filterState(result.state);
      setMessage(`Showing factories in ${result.state}.`);
    } else if (result.type === 'layers') {
      setLayers(result.layers, result.mode);
      setMessage(
        result.mode === 'clear'
          ? 'Context layers cleared.'
          : `${result.mode === 'remove' ? 'Hid' : 'Showing'} ${result.layers.join(', ')} layer${result.layers.length > 1 ? 's' : ''}.`,
      );
    } else if (result.type === 'panel') {
      setPanelOpen(result.open);
      setMessage(result.open ? 'Panel shown.' : 'Panel hidden.');
    } else if (result.type === 'map') {
      mapControl(result.action);
      setMessage(
        result.action === 'fit'
          ? 'Fitted to every plant.'
          : `Zoomed ${result.action === 'zoom-in' ? 'in' : 'out'}.`,
      );
    } else if (result.type === 'copilot') {
      setCopilotOpen(true);
      copilot.send(result.question);
      setMessage('Handed to the Copilot — it answers from this session’s figures.');
    } else if (result.type === 'clear') {
      reset();
      setLayers([], 'clear');
      setMessage('Filters and layers cleared.');
    } else if (result.type === 'ambiguous') {
      setChoices(result.ids);
      setMessage('More than one match. Choose a factory:');
    } else
      setMessage(
        'No rule matched. Try “Find Bhilai”, “Show cement factories”, “Highest intensity”, or “Go to ledger”.',
      );
  }
  function voice() {
    if (listening) {
      recognition.current?.stop();
      setListening(false);
      return;
    }
    const Speech = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Speech) {
      setMessage('Voice input is not supported in this browser. Typed commands are always available.');
      return;
    }
    try {
      const r = new Speech();
      recognition.current = r;
      r.lang = 'en-IN';
      r.continuous = false;
      r.onresult = (e: any) => {
        const input = e.results[0][0].transcript;
        setText(input);
        run(input);
      };
      r.onerror = (e: any) => {
        setListening(false);
        setMessage(
          e.error === 'not-allowed' || e.error === 'service-not-allowed'
            ? 'Microphone access was denied. Type your command instead.'
            : 'Voice input is unavailable. Type your command instead.',
        );
      };
      r.onend = () => setListening(false);
      r.start();
      setListening(true);
      setMessage('Listening…');
    } catch {
      setListening(false);
      setMessage('Microphone could not start. Type your command instead.');
    }
  }
  return (
    <div className="command-section">
      <form
        className="command-bar"
        onSubmit={e => {
          e.preventDefault();
          run(text);
        }}
        data-testid="command-form"
      >
        <Search size={20} strokeWidth={1.7} />
        <label className="sr-only" htmlFor="command">
          Navigation command
        </label>
        <input
          id="command"
          data-testid="command-input"
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Say what you want: “solar at Bhilai at 60%”, “show wind layer”, “which plant first?”"
          autoComplete="off"
        />
        <span className="command-rule" data-testid="command-rule-label">
          Try “cement” or “ledger”
        </span>
        <button
          type="button"
          className={`command-mic ${listening ? 'listening' : ''}`}
          title={listening ? 'Stop listening' : 'Voice command'}
          aria-label={listening ? 'Stop listening' : 'Start voice command'}
          data-testid="voice-command"
          onClick={voice}
        >
          <Mic size={18} />
        </button>
        <button
          type="submit"
          className="command-submit"
          aria-label="Run command"
          title="Run command"
          data-testid="command-submit"
        >
          <CornerDownLeft size={17} />
        </button>
      </form>
      <div className="command-suggestions">
        <span>QUICK COMMANDS</span>
        {[
          'Highest emissions',
          'Show solar and wind',
          'Waste heat at Bhilai at 60%',
          'Which plant first?',
        ].map((s, i) => (
          <button
            key={s}
            data-testid={`quick-command-${i}`}
            onClick={() => {
              setText(s);
              run(s);
            }}
          >
            {s}
            <ArrowIcon />
          </button>
        ))}
      </div>
      {message && (
        <div className="command-feedback" role="status" data-testid="command-feedback">
          <span>{message}</span>
          <Btn
            className="icon-btn"
            variant="ghost"
            aria-label="Dismiss command message"
            data-testid="dismiss-command-message"
            onClick={() => {
              setMessage('');
              setChoices([]);
            }}
          >
            <X size={14} />
          </Btn>
        </div>
      )}
      {choices.length > 0 && (
        <div className="command-choices">
          {choices.map(id => (
            <Btn
              key={id}
              data-testid={`command-choice-${id}`}
              onClick={() => {
                select(id);
                setChoices([]);
                setMessage(`Selected ${factories.find(f => f.id === id)?.name}.`);
              }}
            >
              {factories.find(f => f.id === id)?.name}
            </Btn>
          ))}
        </div>
      )}
    </div>
  );
};
const ArrowIcon = () => <span aria-hidden="true">↗</span>;
