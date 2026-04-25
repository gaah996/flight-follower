import { useEffect, useState } from 'react';
import { Header } from './components/Header.js';
import { Map } from './components/Map/Map.js';
import { DataPanel } from './components/DataPanel/DataPanel.js';
import { PanelToggle } from './components/PanelToggle.js';
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
          position: 'relative',
          display: 'grid',
          gridTemplateColumns: panelVisible ? '1fr 360px' : '1fr',
          minHeight: 0,
        }}
      >
        <div style={{ position: 'relative', minHeight: 0 }}>
          <Map />
          <div style={{ position: 'absolute', top: 80, right: 0, zIndex: 1100 }}>
            <PanelToggle collapseDirection={panelVisible ? 'right' : 'left'} />
          </div>
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
