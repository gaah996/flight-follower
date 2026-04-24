import { useEffect } from 'react';
import { Map } from './components/Map/Map.js';
import { connectWebSocket } from './api/ws.js';

export function App() {
  useEffect(() => connectWebSocket(), []);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', height: '100vh' }}>
      <Map />
      <aside style={{ borderLeft: '1px solid #ddd', padding: 12 }}>Panel (coming soon)</aside>
    </div>
  );
}
