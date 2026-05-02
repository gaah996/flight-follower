import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
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
    tocPosition: null,
    todPosition: null,
    eteToTocSec: null,
    eteToTodSec: null,
  },
};

type FlightStore = {
  state: FlightState;
  wsConnected: boolean;
  // Skip-waypoint override. null = follow server's auto-selected next waypoint.
  manualNextIndex: number | null;
  setFlightState: (s: FlightState) => void;
  setPlan: (p: FlightPlan) => void;
  setWsConnected: (v: boolean) => void;
  setManualNextIndex: (i: number | null) => void;
};

export const useFlightStore = create<FlightStore>()(
  persist(
    (set) => ({
      state: emptyState,
      wsConnected: false,
      manualNextIndex: null,
      setFlightState: (s) => set({ state: s }),
      setPlan: (p) =>
        set((prev) => {
          // Auto-resync: a fresh plan clears any manual override so the user
          // doesn't get "stuck" pointing at a stale fix.
          const fetchedAtChanged = prev.state.plan?.fetchedAt !== p.fetchedAt;
          return {
            state: { ...prev.state, plan: p },
            manualNextIndex: fetchedAtChanged ? null : prev.manualNextIndex,
          };
        }),
      setWsConnected: (v) => set({ wsConnected: v }),
      setManualNextIndex: (i) => set({ manualNextIndex: i }),
    }),
    {
      name: 'ff:nav-override',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (s) => ({ manualNextIndex: s.manualNextIndex }),
    },
  ),
);
