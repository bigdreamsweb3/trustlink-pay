"use client";

import type { ReactNode } from "react";

import { ToastProvider } from "@/src/components/toast-provider";
import { ThemeProvider } from "@/src/lib/theme";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <ToastProvider>{children}</ToastProvider>
    </ThemeProvider>
  );
}
