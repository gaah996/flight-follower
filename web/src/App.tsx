import { useEffect, useState } from 'react';
import { Header } from './components/Header.js';
import { Map } from './components/Map/Map.js';
import { DataPanel } from './components/DataPanel/DataPanel.js';
import { SettingsDialog } from './components/SettingsDialog.js';
import { connectWebSocket } from './api/ws.js';
import { useViewStore } from './store/view.js';

export function App() {
  const [showSettings, setShowSettings] = useState(false);
  const panelVisible = useViewStore((s) => s.panelVisible);
  useEffect(() => connectWebSocket(), []);
  return (
    <div style={{ display: 'grid', gridTemplateRows: '40px 1fr', height: '100vh' }}>
      <Header onOpenSettings={() => setShowSettings(true)} />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: panelVisible ? '1fr 360px' : '1fr',
          minHeight: 0,
        }}
      >
        <div style={{ minHeight: 0 }}>
          <Map />
        </div>
        {panelVisible && (
          <aside
            style={{
              borderLeft: '1px solid var(--ff-border)',
              minHeight: 0,
              background: 'var(--ff-bg)',
            }}
          >
            <DataPanel />
          </aside>
        )}
      </div>
      {showSettings && <SettingsDialog onClose={() => setShowSettings(false)} />}
    </div>
  );
}
