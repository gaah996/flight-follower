import { create } from 'zustand';
import type { FlightPlan, FlightState } from '@ff/shared';

const emptyState: FlightState = {
  connected: false,
  telemetry: null,
  plan: null,
  breadcrumb: [],
  progress: {
    nextWaypoint: null,
    distanceToNextNm: null,
    eteToNextSec: null,
    distanceToDestNm: null,
    eteToDestSec: null,
    flightTimeSec: null,
  },
};

type FlightStore = {
  state: FlightState;
  wsConnected: boolean;
  setFlightState: (s: FlightState) => void;
  setPlan: (p: FlightPlan) => void;
  setWsConnected: (v: boolean) => void;
};

export const useFlightStore = create<FlightStore>((set) => ({
  state: emptyState,
  wsConnected: false,
  setFlightState: (s) => set({ state: s }),
  setPlan: (p) => set((prev) => ({ state: { ...prev.state, plan: p } })),
  setWsConnected: (v) => set({ wsConnected: v }),
}));
