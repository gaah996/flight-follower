import { useEffect, useState } from 'react';
import { Map } from './components/Map/Map.js';
import { DataPanel } from './components/DataPanel/DataPanel.js';
import { ConnectionStatus } from './components/ConnectionStatus.js';
import { SettingsDialog } from './components/SettingsDialog.js';
import { connectWebSocket } from './api/ws.js';

export function App() {
  const [showSettings, setShowSettings] = useState(false);
  useEffect(() => connectWebSocket(), []);
  return (
    <div style={{ display: 'grid', gridTemplateRows: '40px 1fr', height: '100vh' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', borderBottom: '1px solid #e5e7eb', background: '#fafafa' }}>
        <strong style={{ fontSize: 14 }}>Flight Follower</strong>
        <ConnectionStatus />
        <button onClick={() => setShowSettings(true)} style={{ padding: '4px 10px', border: '1px solid #d1d5db', borderRadius: 4, background: 'white', cursor: 'pointer' }}>
          Settings
        </button>
      </header>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', minHeight: 0 }}>
        <Map />
        <aside style={{ borderLeft: '1px solid #e5e7eb', minHeight: 0 }}>
          <DataPanel />
        </aside>
      </div>
      {showSettings && <SettingsDialog onClose={() => setShowSettings(false)} />}
    </div>
  );
}
