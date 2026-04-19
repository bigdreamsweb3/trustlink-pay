"use client";

import type { ReactNode } from "react";

import { ToastProvider } from "@/src/components/toast-provider";
import { AppPanelProvider } from "@/src/lib/app-panel-provider";
import { ThemeProvider } from "@/src/lib/theme";
import { WalletProvider } from "@/src/lib/wallet-provider";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AppPanelProvider>
          <WalletProvider>{children}</WalletProvider>
        </AppPanelProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
