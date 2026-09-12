import { Info, ArrowLeft, ArrowUpRight, SearchX } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from './ui/button';
import type { ReactNode, ButtonHTMLAttributes } from 'react';

export const fmt = (n: number, decimals = 0) =>
  new Intl.NumberFormat('en-IN', { maximumFractionDigits: decimals }).format(n);
export const compact = (n: number) =>
  Math.abs(n) >= 1e6
    ? `${(n / 1e6).toFixed(2)}M`
    : Math.abs(n) >= 1000
      ? `${(n / 1000).toFixed(1)}k`
      : fmt(n, 1);
export const money = (n: number) =>
  `${n < 0 ? '−' : ''}₹${Math.abs(n) >= 1e7 ? `${(Math.abs(n) / 1e7).toFixed(2)} cr` : Math.abs(n) >= 1e5 ? `${(Math.abs(n) / 1e5).toFixed(2)} L` : fmt(Math.abs(n))}`;
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'outline' | 'ghost';
  'data-testid': string;
};
export const Btn = ({ children, variant = 'outline', className = '', ...props }: BtnProps) => (
  <Button
    {...(props as any)}
    variant={variant === 'primary' ? 'default' : variant}
    className={`app-btn ${variant} ${className}`}
  >
    {children}
  </Button>
);
export const PageHeading = ({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) => (
  <div className="page-heading">
    <div>
      <div className="eyebrow" data-testid="page-eyebrow">
        {eyebrow}
      </div>
      <h1 data-testid="page-title">{title}</h1>
      <p className="page-description" data-testid="page-description">
        {description}
      </p>
    </div>
    {action && <div className="heading-action">{action}</div>}
  </div>
);
export const Tag = ({
  children,
  tone = 'neutral',
  id,
}: {
  children: ReactNode;
  tone?: string;
  id: string;
}) => (
  <span className={`tag ${tone}`} data-testid={id}>
    <span className="tag-dot" />
    {children}
  </span>
);
export const Notice = ({
  children,
  id = 'simulation-notice',
  tone = '',
}: {
  children: ReactNode;
  id?: string;
  tone?: string;
}) => (
  <div className={`notice ${tone}`} data-testid={id}>
    <Info size={16} aria-hidden="true" />
    <div>{children}</div>
  </div>
);
export const Stat = ({
  label,
  value,
  unit,
  note,
  icon,
  id,
  accent,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  note: ReactNode;
  icon?: ReactNode;
  id: string;
  accent?: boolean;
}) => (
  <div className={`stat ${accent ? 'accent' : ''}`} data-testid={id}>
    <div className="stat-label">
      {label}
      {icon}
    </div>
    <div className="stat-value" data-testid={`${id}-value`}>
      {value}
      <span>{unit}</span>
    </div>
    <div className="stat-note">{note}</div>
  </div>
);
export const Empty = ({
  title,
  description,
  action,
  id = 'empty-state',
}: {
  title: string;
  description: string;
  action?: ReactNode;
  id?: string;
}) => (
  <div className="empty-state" data-testid={id}>
    <SearchX size={30} strokeWidth={1.4} />
    <h2>{title}</h2>
    <p>{description}</p>
    {action}
  </div>
);
export const NotFound = ({
  kind = 'Page',
  to = '/',
  label = 'Command Map',
}: {
  kind?: string;
  to?: string;
  label?: string;
}) => (
  <Empty
    title={`${kind} not found`}
    description="This link does not match an item in the current demonstration session."
    action={
      <Link className="text-link" to={to} data-testid="not-found-back">
        <ArrowLeft size={16} />
        {label}
      </Link>
    }
  />
);
export const SectionHeading = ({
  title,
  note,
  action,
}: {
  title: string;
  note?: string;
  action?: ReactNode;
}) => (
  <div className="section-heading">
    <div>
      <h2 data-testid={`section-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>{title}</h2>
      {note && <p>{note}</p>}
    </div>
    {action}
  </div>
);
export const ArrowLink = ({ to, children, id }: { to: string; children: ReactNode; id: string }) => (
  <Link to={to} className="text-link" data-testid={id}>
    {children}
    <ArrowUpRight size={15} />
  </Link>
);
