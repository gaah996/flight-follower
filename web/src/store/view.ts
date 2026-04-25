import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type ViewMode = 'overview' | 'follow' | 'manual';
export type LatLng = [number, number];

type ViewStore = {
  mode: ViewMode;
  setMode: (m: ViewMode) => void;
  lastCenter: LatLng | null;
  lastZoom: number | null;
  setLastView: (center: LatLng, zoom: number) => void;
};

export const useViewStore = create<ViewStore>()(
  persist(
    (set) => ({
      mode: 'overview',
      setMode: (m) => set({ mode: m }),
      lastCenter: null,
      lastZoom: null,
      setLastView: (lastCenter, lastZoom) => set({ lastCenter, lastZoom }),
    }),
    {
      name: 'ff:map-view',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (s) => ({ mode: s.mode, lastCenter: s.lastCenter, lastZoom: s.lastZoom }),
    },
  ),
);
