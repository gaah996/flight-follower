import { create } from 'zustand';

export type ViewMode = 'overview' | 'follow' | 'manual';

type ViewStore = {
  mode: ViewMode;
  setMode: (m: ViewMode) => void;
};

export const useViewStore = create<ViewStore>((set) => ({
  mode: 'overview',
  setMode: (m) => set({ mode: m }),
}));
