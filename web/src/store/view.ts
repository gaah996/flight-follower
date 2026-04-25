import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type ViewMode = 'overview' | 'follow' | 'manual';

type ViewStore = {
  mode: ViewMode;
  setMode: (m: ViewMode) => void;
};

export const useViewStore = create<ViewStore>()(
  persist(
    (set) => ({
      mode: 'overview',
      setMode: (m) => set({ mode: m }),
    }),
    {
      name: 'ff:view-mode',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (s) => ({ mode: s.mode }),
    },
  ),
);
