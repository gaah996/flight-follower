import { EventEmitter } from 'node:events';
import {
  open,
  Protocol,
  SimConnectDataType,
  SimConnectPeriod,
  type RecvSimObjectData,
  type SimConnectConnection,
} from 'node-simconnect';
import type { RawTelemetry } from '@ff/shared';
import { SIM_VARS, buildTelemetry } from './variables.js';

const APP_NAME = 'flight-follower';
const DATA_DEF_ID = 0;
const REQUEST_ID = 0;
const USER_OBJECT = 0; // SIMCONNECT_OBJECT_ID_USER
const RECONNECT_DELAY_MS = 5000;

export class SimBridge extends EventEmitter {
  private handle: SimConnectConnection | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private stopped = false;

  async connect(): Promise<void> {
    this.stopped = false;
    try {
      const { handle } = await open(APP_NAME, Protocol.FSX_SP2);
      this.handle = handle;
      this.registerDefinitions(handle);
      handle.on('simObjectData', (msg: RecvSimObjectData) => this.onData(msg));
      handle.on('close', () => this.onClose());
      handle.on('exception', (ex) => this.emit('warning', { source: 'simconnect', message: ex.exceptionName }));
      handle.requestDataOnSimObject(
        REQUEST_ID,
        DATA_DEF_ID,
        USER_OBJECT,
        SimConnectPeriod.SIM_FRAME,
        0,
        0,
        30, // every ~30 sim frames ≈ 2 Hz at 60 fps
        0,
      );
      this.emit('open');
    } catch (err) {
      this.emit('warning', { source: 'simconnect', message: `connect failed: ${(err as Error).message}` });
      this.scheduleReconnect();
    }
  }

  stop(): void {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.handle?.close();
    this.handle = null;
  }

  private registerDefinitions(handle: SimConnectConnection): void {
    for (const [name, units] of SIM_VARS) {
      handle.addToDataDefinition(DATA_DEF_ID, name, units, SimConnectDataType.FLOAT64);
    }
  }

  private onData(msg: RecvSimObjectData): void {
    if (msg.requestID !== REQUEST_ID) return;
    const values: number[] = [];
    for (let i = 0; i < SIM_VARS.length; i++) {
      values.push(msg.data.readFloat64());
    }
    const telemetry: RawTelemetry = buildTelemetry(values, Date.now());
    this.emit('telemetry', telemetry);
  }

  private onClose(): void {
    this.handle = null;
    this.emit('close');
    if (!this.stopped) this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, RECONNECT_DELAY_MS);
  }
}
