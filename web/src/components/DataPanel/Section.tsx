import type { ReactNode } from 'react';
import { useViewStore } from '../../store/view.js';

type Props = {
  title: string;
  sectionKey: string;
  children: ReactNode;
};

export function Section({ title, sectionKey, children }: Props) {
  const open = useViewStore((s) => s.sections[sectionKey] ?? true);
  const toggle = useViewStore((s) => s.toggleSection);
  return (
    <section style={{ marginBottom: 12 }}>
      <button
        type="button"
        onClick={() => toggle(sectionKey)}
        aria-expanded={open}
        aria-controls={`section-${sectionKey}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          width: '100%',
          padding: '4px 6px',
          background: 'transparent',
          color: 'var(--ff-fg-muted)',
          border: 'none',
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: 0.6,
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span
          aria-hidden
          style={{
            display: 'inline-block',
            transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 120ms ease',
            fontSize: 10,
          }}
        >
          ▶
        </span>
        {title}
      </button>
      {open && (
        <div id={`section-${sectionKey}`} style={{ marginTop: 4 }}>
          {children}
        </div>
      )}
    </section>
  );
}
