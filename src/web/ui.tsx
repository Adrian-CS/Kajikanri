// Piezas pequeñas compartidas por las pantallas (iconos, interruptor, barra inferior).
import type { ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { useStore } from './store';

const svg = (d: ReactNode, size = 22, width = 2) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}
  </svg>
);

export const Icon = {
  plus: (s = 22) => svg(<path d="M12 5v14M5 12h14" />, s, 2.2),
  minus: (s = 20) => svg(<path d="M5 12h14" />, s, 2.4),
  check: (s = 22) => svg(<path d="M5 12.5l4.5 4.5L19 7.5" />, s, 2.4),
  back: (s = 24) => svg(<path d="M15 5l-7 7 7 7" />, s, 2.2),
  left: (s = 18) => svg(<path d="M15 5l-7 7 7 7" />, s, 2.4),
  right: (s = 18) => svg(<path d="M9 5l7 7-7 7" />, s, 2.4),
  home: (s = 22) => svg(<path d="M4 11l8-7 8 7v9H4z" />, s),
  list: (s = 22) => svg(<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />, s),
  trash: (s = 22) => svg(<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />, s),
  gear: (s = 22) =>
    svg(
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" />
      </>,
      s,
    ),
  timer: (s = 16) =>
    svg(
      <>
        <circle cx="12" cy="13" r="8" />
        <path d="M12 9v4l2.5 2M10 2h4" />
      </>,
      s,
      2.2,
    ),
  share: (s = 18) => svg(<path d="M12 3v12M7 8l5-5 5 5M5 13v7h14v-7" />, s),
  x: (s = 18) => svg(<path d="M6 6l12 12M18 6L6 18" />, s, 2.2),
};

export function Toggle({ on, label, onChange, disabled }: { on: boolean; label: string; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" className={`toggle${on ? ' on' : ''}`} aria-label={label} aria-pressed={on} disabled={disabled} onClick={() => onChange(!on)}>
      <span />
    </button>
  );
}

export function Segmented<K extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { key: K; label: string }[];
  value: K;
  onChange: (k: K) => void;
}) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button key={String(o.key)} type="button" className={o.key === value ? 'sel' : ''} aria-pressed={o.key === value} onClick={() => onChange(o.key)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function TopBar({ title, backTo = '/' }: { title: string; backTo?: string }) {
  const { t } = useStore();
  return (
    <div className="topbar">
      <Link href={backTo} className="icon-btn" aria-label={t.back}>
        {Icon.back()}
      </Link>
      <div className="topbar-title">{title}</div>
      <div style={{ width: 48 }} />
    </div>
  );
}

export function BottomNav() {
  const { t } = useStore();
  const [loc] = useLocation();
  const items = [
    { href: '/', label: t.navToday, icon: Icon.home(), match: (p: string) => p === '/' },
    { href: '/tasks', label: t.navTasks, icon: Icon.list(), match: (p: string) => p.startsWith('/tasks') },
    { href: '/trash', label: t.navTrash, icon: Icon.trash(), match: (p: string) => p === '/trash' },
    { href: '/settings', label: t.navSettings, icon: Icon.gear(), match: (p: string) => p === '/settings' },
  ];
  return (
    <nav className="bottomnav">
      {items.map((i) => (
        <Link key={i.href} href={i.href} className={i.match(loc) ? 'active' : ''} aria-current={i.match(loc) ? 'page' : undefined}>
          {i.icon}
          {i.label}
        </Link>
      ))}
    </nav>
  );
}

export const pad2 = (n: number) => String(n).padStart(2, '0');
export const hhmm = (mins: number) => `${pad2(Math.floor(mins / 60))}:${pad2(mins % 60)}`;
