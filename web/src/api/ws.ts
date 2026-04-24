import type { WsMessage } from '@ff/shared';
import { useFlightStore } from '../store/flight.js';
import { useViewStore } from '../store/view.js';

const MAX_BACKOFF_MS = 10_000;

export function connectWebSocket(): () => void {
  let backoff = 1000;
  let ws: WebSocket | null = null;
  let reconnectTimer: number | null = null;
  let stopped = false;

  const open = () => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/ws`);

    ws.onopen = () => {
      backoff = 1000;
      useFlightStore.getState().setWsConnected(true);
    };

    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data) as WsMessage;
      const store = useFlightStore.getState();
      if (msg.type === 'state') {
        store.setFlightState(msg.payload);
      } else if (msg.type === 'plan') {
        store.setPlan(msg.payload);
        // Spec §10: Overview is the default view mode on plan import.
        useViewStore.getState().setMode('overview');
      } else if (msg.type === 'error') {
        console.warn('[ws error]', msg.payload);
      }
    };

    ws.onclose = () => {
      useFlightStore.getState().setWsConnected(false);
      if (stopped) return;
      reconnectTimer = window.setTimeout(open, backoff);
      backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
    };

    ws.onerror = () => ws?.close();
  };

  open();

  return () => {
    stopped = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    ws?.close();
  };
}
