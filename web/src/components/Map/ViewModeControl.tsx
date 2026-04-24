import { useViewStore, type ViewMode } from '../../store/view.js';

const MODES: ViewMode[] = ['overview', 'follow', 'manual'];

export function ViewModeControl() {
  const mode = useViewStore((s) => s.mode);
  const setMode = useViewStore((s) => s.setMode);
  return (
    <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 1000, background: 'white', borderRadius: 6, boxShadow: '0 1px 3px rgba(0,0,0,.15)', padding: 4, display: 'flex', gap: 4 }}>
      {MODES.map((m) => (
        <button
          key={m}
          onClick={() => setMode(m)}
          style={{
            padding: '4px 10px',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
            background: mode === m ? '#2563eb' : 'transparent',
            color: mode === m ? 'white' : '#111',
            textTransform: 'capitalize',
          }}
        >
          {m}
        </button>
      ))}
    </div>
  );
}
