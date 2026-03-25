"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  clearStoredPendingAuth,
  clearStoredToken,
  clearStoredUser,
  getStoredPendingAuth,
  getStoredToken,
  getStoredUser,
  setStoredToken,
  setStoredUser
} from "@/src/lib/storage";
import type { AuthResult, PendingAuthSession, UserProfile } from "@/src/lib/types";

export function useAuthenticatedSession(redirectPath: string) {
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [pendingAuth, setPendingAuth] = useState<PendingAuthSession | null>(null);

  useEffect(() => {
    const token = getStoredToken();
    const savedUser = getStoredUser();
    const savedPendingAuth = getStoredPendingAuth();

    if (!token || !savedUser) {
      if (savedPendingAuth?.user) {
        setAccessToken(null);
        setUser(savedPendingAuth.user);
        setPendingAuth(savedPendingAuth);
        setHydrated(true);
        return;
      }

      router.replace(`/auth?mode=login&redirect=${encodeURIComponent(redirectPath)}`);
      return;
    }

    if (savedPendingAuth) {
      clearStoredPendingAuth();
    }

    setAccessToken(token);
    setUser(savedUser);
    setPendingAuth(null);
    setHydrated(true);
  }, [redirectPath, router]);

  function completePendingAuth(result: AuthResult) {
    setStoredToken(result.accessToken);
    setStoredUser(result.user);
    clearStoredPendingAuth();
    setAccessToken(result.accessToken);
    setUser(result.user);
    setPendingAuth(null);
  }

  function logout() {
    clearStoredPendingAuth();
    clearStoredToken();
    clearStoredUser();
    router.replace("/auth?mode=login");
  }

  return {
    hydrated,
    accessToken,
    user,
    setUser,
    pendingAuth,
    completePendingAuth,
    logout
  };
}
