import { useFlightStore } from '../../store/flight.js';
import { dash, fmtLatHemi, fmtLonHemi, fmtNum } from './fmt.js';

export function PositionCard() {
  const t = useFlightStore((s) => s.state.telemetry);
  const lat = fmtLatHemi(t?.position.lat);
  const lon = fmtLonHemi(t?.position.lon);
  return (
    <Card title="Position">
      <Row label="Lat">{lat}</Row>
      <Row label="Lon">{lon}</Row>
      <div
        style={{
          marginTop: 6,
          paddingTop: 6,
          borderTop: '1px solid var(--ff-border)',
          fontSize: 12,
          color: 'var(--ff-fg-muted)',
        }}
      >
        <Row label="HDG">{t ? `${fmtNum(t.heading.magnetic, 0)}°` : dash}</Row>
      </div>
    </Card>
  );
}

export function Card({
  title,
  children,
  sideSlot,
}: {
  title: string;
  children: React.ReactNode;
  sideSlot?: React.ReactNode;
}) {
  const content = (
    <>
      <h3
        style={{
          margin: 0,
          fontSize: 11,
          color: 'var(--ff-fg-muted)',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: 0.6,
        }}
      >
        {title}
      </h3>
      <div style={{ marginTop: 4, fontSize: 14 }}>{children}</div>
    </>
  );
  return (
    <section
      style={{
        padding: 10,
        border: '1px solid var(--ff-border)',
        background: 'var(--ff-bg-elevated)',
        borderRadius: 6,
        marginBottom: 8,
        color: 'var(--ff-fg)',
      }}
    >
      {sideSlot ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>{content}</div>
          {sideSlot}
        </div>
      ) : (
        content
      )}
    </section>
  );
}

export function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span style={{ color: 'var(--ff-fg-muted)' }}>{label}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--ff-fg)' }}>{children}</span>
    </div>
  );
}
