import { useMap } from 'react-leaflet';
import { Target } from '@gravity-ui/icons';
import { useFlightStore } from '../../store/flight.js';

export function CenterButton() {
  const map = useMap();
  const telemetry = useFlightStore((s) => s.state.telemetry);
  const disabled = !telemetry;

  const onCenter = () => {
    if (!telemetry) return;
    // One-shot pan — does NOT switch to follow mode (programmatic pan
    // doesn't fire dragstart, so MapController leaves the mode alone).
    map.panTo([telemetry.position.lat, telemetry.position.lon], { animate: true });
  };

  return (
    <button
      type="button"
      onClick={onCenter}
      disabled={disabled}
      title={disabled ? 'Center on aircraft (no telemetry)' : 'Center on aircraft'}
      aria-label="Center on aircraft"
      // Position just below the Leaflet zoom controls (top:10 + 56px stack + 8px gap = 74).
      style={{
        position: 'absolute',
        top: 74,
        left: 10,
        zIndex: 1000,
        width: 28,
        height: 28,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--ff-bg-translucent)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        color: disabled ? 'var(--ff-fg-muted)' : 'var(--ff-fg)',
        border: '1px solid var(--ff-border)',
        borderRadius: 14,
        padding: 0,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background 120ms ease',
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.background = 'var(--ff-bg-elevated)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'var(--ff-bg-translucent)';
      }}
    >
      <Target width={14} height={14} aria-hidden />
    </button>
  );
}
