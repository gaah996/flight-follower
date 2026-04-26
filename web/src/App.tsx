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
      <div style={{ position: 'relative', minHeight: 0 }}>
        <Map />
        {panelVisible && (
          <aside
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              width: 360,
              borderLeft: '1px solid var(--ff-border)',
              background: 'var(--ff-bg-translucent)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              zIndex: 500,
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
