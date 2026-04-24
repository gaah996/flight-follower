import { useFlightStore } from '../store/flight.js';

export function ConnectionStatus() {
  const simConnected = useFlightStore((s) => s.state.connected);
  const wsConnected = useFlightStore((s) => s.wsConnected);

  const wsText = wsConnected ? 'WS connected' : 'Reconnecting…';
  const simText = simConnected ? 'Sim connected' : 'Sim disconnected';
  const simColor = simConnected ? '#059669' : '#dc2626';
  const wsColor = wsConnected ? '#059669' : '#f59e0b';

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 13 }}>
      <Dot color={simColor} /> {simText}
      <Dot color={wsColor} /> {wsText}
    </div>
  );
}

function Dot({ color }: { color: string }) {
  return <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, background: color }} />;
}
