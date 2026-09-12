import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Bell,
  FileText,
  Download,
  Check,
  ChevronRight,
  Mail,
  Shield,
  TrendingUp,
  Activity,
} from 'lucide-react';
import { useSession } from '../state/SessionContext';
import { generateDigest } from '../domain/digest';
import { downloadText } from '../domain/calculations';
import { PageHeading, Tag, Btn, Notice, SectionHeading, Empty } from '../components/Primitives';
import { Switch } from '../components/ui/switch';
// Only the digest preference is consumed anywhere; the others were inert controls that implied
// a live alert feed this demonstration does not have.
const preferences = [
  {
    id: 'digest',
    title: 'Portfolio digest',
    description: 'Include portfolio snapshots in the in-app inbox.',
    icon: FileText,
  },
];
export default function Alerts() {
  const { factories, ledger, intake, inbox, settings, setSetting, markRead, addDigest } = useSession(),
    [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState('all'),
    [selected, setSelected] = useState<string | null>(null),
    [digest, setDigest] = useState(''),
    [generated, setGenerated] = useState(false);
  const rows = inbox.filter(m => filter !== 'unread' || !m.read),
    active = inbox.find(m => m.id === selected);
  const detail = useRef<HTMLElement>(null);
  // The detail pane sits below the whole inbox list, so an opened message would otherwise land below the fold.
  useEffect(() => {
    if (!active) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    detail.current?.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
  }, [selected, active]);
  const generate = () => {
    const body = generateDigest(factories, ledger, intake);
    setDigest(body);
    setGenerated(true);
    setParams({});
    if (settings.digest) {
      const id = addDigest(body);
      setSelected(id);
      markRead(id);
    }
  };
  return (
    <>
      <PageHeading
        eyebrow="STAY CLOSE TO WHAT MATTERS"
        title="Alerts"
        description="A considered inbox for your industrial portfolio. Less noise, more context."
        action={
          <Btn variant="primary" data-testid="generate-digest" onClick={generate}>
            <FileText size={16} />
            Generate digest
          </Btn>
        }
      />
      <div className="alerts-layout">
        <section>
          <SectionHeading
            title="Your inbox"
            note={`${inbox.filter(m => !m.read).length} unread · Demonstration messages`}
            action={
              <div className="segmented small" role="group" aria-label="Inbox filter">
                <button
                  data-testid="inbox-filter-all"
                  aria-pressed={filter === 'all'}
                  className={filter === 'all' ? 'active' : ''}
                  onClick={() => setFilter('all')}
                >
                  All
                </button>
                <button
                  data-testid="inbox-filter-unread"
                  aria-pressed={filter === 'unread'}
                  className={filter === 'unread' ? 'active' : ''}
                  onClick={() => setFilter('unread')}
                >
                  Unread
                </button>
              </div>
            }
          />
          <div className="inbox-list">
            {rows.map(m => (
              <button
                key={m.id}
                className={`inbox-item ${!m.read ? 'unread' : ''} ${selected === m.id ? 'selected' : ''}`}
                data-testid={`inbox-item-${m.id}`}
                onClick={() => {
                  setSelected(m.id);
                  markRead(m.id);
                }}
              >
                <span className={`inbox-icon ${m.type}`}>
                  {m.type === 'digest' ? (
                    <FileText size={19} />
                  ) : m.type === 'exposure' ? (
                    <TrendingUp size={19} />
                  ) : (
                    <Activity size={19} />
                  )}
                </span>
                <div>
                  <span className="inbox-item-heading">
                    <strong>{m.title}</strong>
                    {!m.read && <i aria-label="Unread" />}
                  </span>
                  <p>{m.body.replace(/\n/g, ' ').slice(0, 95)}…</p>
                  <span className="inbox-date">
                    {new Date(m.date).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}{' '}
                    · {m.type === 'digest' ? 'Session snapshot' : 'Fixture alert'}
                  </span>
                </div>
                <ChevronRight size={15} />
              </button>
            ))}
            {!rows.length && (
              <Empty title="You’re all caught up" description="No unread messages remain in this session." />
            )}
          </div>
          {active && (
            <article className="message-detail" data-testid="inbox-message-detail" ref={detail}>
              <div className="eyebrow">{active.type.toUpperCase()} / IN-APP MESSAGE</div>
              <h2 data-testid="inbox-message-title">{active.title}</h2>
              <div className="message-body" data-testid="inbox-message-body">
                {active.body}
              </div>
              <Tag id="inbox-message-read" tone="success">
                Read in this session
              </Tag>
            </article>
          )}
        </section>
        <aside className="alert-preferences">
          <SectionHeading title="What reaches your inbox" note="Session-only preferences" />
          {preferences.map(p => (
            <div className="preference-row" key={p.id}>
              <p.icon size={18} />
              <div>
                <label htmlFor={`pref-${p.id}`} data-testid={`preference-label-${p.id}`}>
                  {p.title}
                </label>
                <p>{p.description}</p>
              </div>
              <Switch
                id={`pref-${p.id}`}
                data-testid={`preference-${p.id}`}
                checked={settings[p.id]}
                onCheckedChange={(value: boolean) => setSetting(p.id, value)}
                aria-label={p.title}
              />
            </div>
          ))}
          <Notice id="preferences-note">
            Preferences remain active while navigating this session and reset on refresh. Existing fixture
            messages stay in the inbox; no live alert feed is connected.
          </Notice>
          <div className="delivery-note">
            <Mail size={19} />
            <div>
              <strong>In-app delivery only</strong>
              <p>No email service or automatic schedule is connected.</p>
            </div>
          </div>
        </aside>
      </div>
      <section className="digest-section">
        <div className="digest-heading">
          <div>
            <div className="eyebrow">THE BIG PICTURE, IN ONE PLACE</div>
            <h2 data-testid="digest-section-title">Your portfolio, distilled.</h2>
            <p>A rule-based digest of the current factories, estimates, and documentation gaps.</p>
          </div>
          <Btn data-testid="generate-digest-bottom" onClick={generate}>
            <FileText size={16} />
            {generated ? 'Regenerate digest' : 'Generate a snapshot'}
          </Btn>
        </div>
        {params.get('digest') === 'true' && !generated && (
          <Notice id="digest-ready-notice">
            Your portfolio snapshot is ready to generate from the current session.
          </Notice>
        )}
        {generated && (
          <>
            <div className="digest-preview" data-testid="digest-preview">
              <pre>{digest}</pre>
            </div>
            <div className="digest-actions">
              <span role="status" data-testid="digest-status">
                <Check size={15} />
                {settings.digest
                  ? 'Generated and added to your in-app inbox. No email sent.'
                  : 'Generated below. Inbox delivery is off. No email sent.'}
              </span>
              <Btn
                data-testid="download-digest"
                onClick={() =>
                  downloadText(digest, 'leakpoint-portfolio-digest.txt', 'text/plain;charset=utf-8')
                }
              >
                <Download size={16} />
                Download digest
              </Btn>
            </div>
          </>
        )}
      </section>
    </>
  );
}
