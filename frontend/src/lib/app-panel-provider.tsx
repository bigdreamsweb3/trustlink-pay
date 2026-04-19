"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

type AppPanelId = "wallet" | "settings" | "profile" | null;

type AppPanelContextValue = {
  activePanel: AppPanelId;
  openPanel: (panel: Exclude<AppPanelId, null>) => void;
  closePanel: () => void;
};

const AppPanelContext = createContext<AppPanelContextValue | null>(null);

export function AppPanelProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [activePanel, setActivePanel] = useState<AppPanelId>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (window.matchMedia("(max-width: 767px)").matches) {
      setActivePanel(null);
    }
  }, [pathname]);

  const value = useMemo<AppPanelContextValue>(
    () => ({
      activePanel,
      openPanel: (panel) => setActivePanel(panel),
      closePanel: () => setActivePanel(null),
    }),
    [activePanel],
  );

  return <AppPanelContext.Provider value={value}>{children}</AppPanelContext.Provider>;
}

export function useAppPanel() {
  const context = useContext(AppPanelContext);

  if (!context) {
    throw new Error("useAppPanel must be used within AppPanelProvider");
  }

  return context;
}
