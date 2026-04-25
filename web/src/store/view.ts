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
  fitOverviewRequest: number;
  requestFitOverview: () => void;
  panelVisible: boolean;
  setPanelVisible: (v: boolean) => void;
  togglePanel: () => void;
  sections: Record<string, boolean>;
  setSectionOpen: (key: string, open: boolean) => void;
  toggleSection: (key: string) => void;
};

const DEFAULT_SECTIONS: Record<string, boolean> = {
  state: true,
  time: true,
  route: true,
};

export const useViewStore = create<ViewStore>()(
  persist(
    (set) => ({
      mode: 'overview',
      setMode: (m) => set({ mode: m }),
      lastCenter: null,
      lastZoom: null,
      setLastView: (lastCenter, lastZoom) => set({ lastCenter, lastZoom }),
      fitOverviewRequest: 0,
      requestFitOverview: () => set((s) => ({ fitOverviewRequest: s.fitOverviewRequest + 1 })),
      panelVisible: true,
      setPanelVisible: (v) => set({ panelVisible: v }),
      togglePanel: () => set((s) => ({ panelVisible: !s.panelVisible })),
      sections: DEFAULT_SECTIONS,
      setSectionOpen: (key, open) =>
        set((s) => ({ sections: { ...s.sections, [key]: open } })),
      toggleSection: (key) =>
        set((s) => ({ sections: { ...s.sections, [key]: !(s.sections[key] ?? true) } })),
    }),
    {
      name: 'ff:map-view',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (s) => ({
        mode: s.mode,
        lastCenter: s.lastCenter,
        lastZoom: s.lastZoom,
        panelVisible: s.panelVisible,
        sections: s.sections,
      }),
    },
  ),
);
