import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type Theme = 'dark' | 'light';

type ThemeStore = {
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
};

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      theme: 'dark',
      toggle: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
      setTheme: (t) => set({ theme: t }),
    }),
    {
      name: 'ff:theme',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
