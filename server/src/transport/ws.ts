import type { FastifyInstance } from 'fastify';
import { WebSocketServer, type WebSocket } from 'ws';
import type { FlightPlan, WsMessage } from '@ff/shared';
import type { Aggregator } from '../state/aggregator.js';

const BROADCAST_INTERVAL_MS = 500; // 2 Hz

export function attachWsBroadcaster(app: FastifyInstance, aggregator: Aggregator): () => void {
  const wss = new WebSocketServer({ noServer: true });

  app.server.on('upgrade', (req, socket, head) => {
    if (req.url !== '/ws') {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (ws) => {
    send(ws, { type: 'state', payload: aggregator.getState() });
    const plan = aggregator.getState().plan;
    if (plan) send(ws, { type: 'plan', payload: plan });
  });

  const planHandler = (plan: FlightPlan) => {
    broadcast(wss, { type: 'plan', payload: plan });
  };
  aggregator.on('plan', planHandler);

  const timer = setInterval(() => {
    broadcast(wss, { type: 'state', payload: aggregator.getState() });
  }, BROADCAST_INTERVAL_MS);

  return () => {
    clearInterval(timer);
    aggregator.off('plan', planHandler);
    wss.close();
  };
}

function send(ws: WebSocket, msg: WsMessage): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(wss: WebSocketServer, msg: WsMessage): void {
  const data = JSON.stringify(msg);
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) client.send(data);
  }
}
