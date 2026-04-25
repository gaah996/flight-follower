import { useFlightStore } from '../../store/flight.js';
import { fmtLatHemi, fmtLonHemi } from './fmt.js';

export function PositionCard() {
  const t = useFlightStore((s) => s.state.telemetry);
  const lat = fmtLatHemi(t?.position.lat);
  const lon = fmtLonHemi(t?.position.lon);
  return (
    <Card title="Position">
      <Row label="Lat">{lat}</Row>
      <Row label="Lon">{lon}</Row>
    </Card>
  );
}

export function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ padding: 10, border: '1px solid #e5e7eb', borderRadius: 6, marginBottom: 8 }}>
      <h3 style={{ margin: 0, fontSize: 12, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.4 }}>{title}</h3>
      <div style={{ marginTop: 4, fontSize: 14 }}>{children}</div>
    </section>
  );
}

export function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span style={{ color: '#6b7280' }}>{label}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{children}</span>
    </div>
  );
}
