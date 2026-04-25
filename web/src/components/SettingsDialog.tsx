import { useEffect, useState } from 'react';
import { fetchSimbriefPlan, getSettings, saveSettings } from '../api/rest.js';
import { useViewStore } from '../store/view.js';

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const [userId, setUserId] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getSettings().then((s) => setUserId(s.simbriefUserId ?? ''));
  }, []);

  async function onSave() {
    setBusy(true);
    try {
      await saveSettings({ simbriefUserId: userId.trim() || null });
      setStatus('Saved.');
    } catch (err) {
      setStatus(`Save failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function onFetch() {
    setBusy(true);
    setStatus(null);
    try {
      await saveSettings({ simbriefUserId: userId.trim() || null });
      await fetchSimbriefPlan();
      // Frame the freshly-imported route. WS reconnects don't trigger this
      // because the WS handler no longer touches view mode.
      useViewStore.getState().setMode('overview');
      setStatus('Plan fetched.');
    } catch (err) {
      setStatus(`Fetch failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={overlay}>
      <div style={dialog}>
        <h2 style={{ marginTop: 0 }}>Settings</h2>
        <label style={{ display: 'block', marginBottom: 8 }}>
          <div style={{ fontSize: 12, color: '#6b7280' }}>Simbrief user ID</div>
          <input value={userId} onChange={(e) => setUserId(e.target.value)} style={input} />
        </label>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button onClick={onSave} disabled={busy} style={btn}>Save</button>
          <button onClick={onFetch} disabled={busy || !userId.trim()} style={{ ...btn, background: '#2563eb', color: 'white' }}>
            Fetch latest plan
          </button>
          <button onClick={onClose} style={btn}>Close</button>
        </div>
        {status && <p style={{ marginTop: 12, color: status.startsWith('Save') || status === 'Plan fetched.' ? '#059669' : '#dc2626' }}>{status}</p>}
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,.3)', display: 'grid', placeItems: 'center', zIndex: 2000,
};
const dialog: React.CSSProperties = {
  background: 'white', padding: 20, borderRadius: 8, minWidth: 360, boxShadow: '0 10px 30px rgba(0,0,0,.2)',
};
const input: React.CSSProperties = {
  display: 'block', width: '100%', boxSizing: 'border-box', padding: 8, border: '1px solid #d1d5db', borderRadius: 4, fontSize: 14,
};
const btn: React.CSSProperties = {
  padding: '6px 12px', borderRadius: 4, border: '1px solid #d1d5db', background: 'white', cursor: 'pointer',
};
