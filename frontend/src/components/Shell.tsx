import { NavLink, Link, useLocation } from 'react-router-dom';
import { Bell, Menu, SlidersHorizontal, Globe2 } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { useSession } from '../state/SessionContext';
import { useMapPanel } from '../state/ui';
import {
  DropdownMenu,
  DropdownMenuContent as RawContent,
  DropdownMenuItem as RawItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { SettingsDialog } from './SettingsDialog';

const DropdownMenuContent = RawContent as any;
const DropdownMenuItem = RawItem as any;

const navItems = [
  { to: '/', label: 'Command Map', short: 'Map' },
  { to: '/intake', label: 'Data Intake', short: 'Intake' },
  { to: '/factories', label: 'Factories', short: 'Factories' },
  { to: '/interventions', label: 'Interventions', short: 'Interventions' },
  { to: '/credits', label: 'Credits', short: 'Credits' },
  { to: '/ledger', label: 'Ledger', short: 'Ledger' },
  { to: '/alerts', label: 'Alerts', short: 'Alerts' },
];
const testid = (l: string) => `nav-${l.toLowerCase().replace(/ /g, '-')}`;

export const Shell = ({ children }: { children: ReactNode }) => {
  const { pathname } = useLocation();
  const { inbox } = useSession();
  const { panelOpen, setPanelOpen } = useMapPanel();
  const unread = inbox.filter(m => !m.read).length;
  const isMap = pathname === '/';
  const current = navItems.find(i => (i.to === '/' ? pathname === '/' : pathname.startsWith(i.to)));
  const label = pathname.startsWith('/factories/')
    ? pathname.endsWith('/profile')
      ? 'Factory Profile'
      : 'Factory Detail'
    : pathname.startsWith('/interventions/')
      ? 'Intervention Detail'
      : current?.label || 'Not found';
  useEffect(() => {
    document.title = `Leakpoint — ${label}`;
    window.scrollTo(0, 0);
  }, [pathname, label]);

  return (
    <div className={`app-shell ${isMap ? 'is-map' : ''}`}>
      <a href="#main-content" className="skip-link" data-testid="skip-to-content">
        Skip to content
      </a>
      <header className="topnav" data-testid="top-nav">
        <Link className="nav-brand" to="/" data-testid="brand-home">
          <span className="brand-symbol">
            <span />
            <i />
          </span>
          leakpoint<span className="brand-period">.</span>
        </Link>
        <nav className="nav-capsule" aria-label="Primary navigation">
          {navItems.map(i => (
            <NavLink
              end={i.to === '/'}
              to={i.to}
              key={i.to}
              data-testid={testid(i.label)}
              className={({ isActive }) => `nav-pill ${isActive ? 'active' : ''}`}
            >
              {i.short}
              {i.to === '/alerts' && unread > 0 && (
                <span className="pill-count" data-testid="unread-count">
                  {unread}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="nav-right">
          {isMap && (
            <button
              className={`nav-controls ${panelOpen ? 'active' : ''}`}
              data-testid="toggle-map-panel"
              aria-pressed={panelOpen}
              aria-label={panelOpen ? 'Hide map controls' : 'Show map controls'}
              onClick={() => setPanelOpen(!panelOpen)}
            >
              <SlidersHorizontal size={16} />
              <span>Controls</span>
            </button>
          )}
          <span className="nav-region" data-testid="region-label">
            <Globe2 size={15} />
            India
          </span>
          <Link to="/alerts" className="nav-bell" aria-label="Open alerts" data-testid="topbar-alerts">
            <Bell size={18} />
            {unread > 0 && <i />}
          </Link>
          <SettingsDialog />
          <div className="avatar" aria-label="Demo workspace user" data-testid="user-avatar">
            LP
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="nav-menu-btn"
                aria-label="Open navigation menu"
                data-testid="open-navigation"
              >
                <Menu size={19} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="nav-dropdown" data-testid="nav-dropdown">
              {navItems.map(i => (
                <DropdownMenuItem key={i.to} asChild>
                  <Link to={i.to} data-testid={`menu-${testid(i.label)}`}>
                    {i.label}
                    {i.to === '/alerts' && unread > 0 && <span className="menu-count">{unread}</span>}
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      {isMap ? (
        <main id="main-content" tabIndex={-1} className="map-main">
          {children}
        </main>
      ) : (
        <>
          <main id="main-content" tabIndex={-1} className="page-content">
            {children}
          </main>
          <footer className="app-footer" data-testid="app-footer">
            <span>Built for a lower-carbon industry.</span>
            <span>Illustrative dataset · FY 2025</span>
          </footer>
        </>
      )}
    </div>
  );
};
