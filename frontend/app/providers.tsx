"use client";

import type { ReactNode } from "react";

import { ToastProvider } from "@/src/components/toast-provider";

export function AppProviders({ children }: { children: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}
