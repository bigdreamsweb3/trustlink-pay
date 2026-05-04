"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  clearStoredPendingAuth,
  clearStoredSessionActivityAt,
  clearStoredToken,
  clearStoredUser,
  getStoredPendingAuth,
  getStoredSessionActivityAt,
  getStoredToken,
  getStoredUser,
  setStoredPendingAuth,
  setStoredSessionActivityAt,
  setStoredToken,
  setStoredUser
} from "@/src/lib/storage";
import { apiPost } from "@/src/lib/api";
import type { AuthResult, PendingAuthSession, UserProfile } from "@/src/lib/types";

const PIN_RELOCK_IDLE_MS = 10 * 60 * 1000;
const PIN_RELOCK_CHECK_INTERVAL_MS = 30 * 1000;

export function useAuthenticatedSession(redirectPath: string) {
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [pendingAuth, setPendingAuth] = useState<PendingAuthSession | null>(null);
  const pinChallengeBusyRef = useRef(false);

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

    setAccessToken(token);
    setUser(savedUser);
    setPendingAuth(savedPendingAuth ?? null);
    setHydrated(true);
  }, [redirectPath, router]);

  useEffect(() => {
    if (!hydrated || !accessToken || !user || pendingAuth) {
      return;
    }

    const storedActivityAt = getStoredSessionActivityAt();
    if (storedActivityAt == null) {
      setStoredSessionActivityAt();
      return;
    }

    async function requestPinChallenge() {
      if (pinChallengeBusyRef.current) {
        return;
      }

      pinChallengeBusyRef.current = true;
      try {
        const result = await apiPost<{
          challengeToken: string;
          user: UserProfile;
        }>("/api/auth/pin/challenge", {}, accessToken ?? undefined);
        const nextPendingAuth = {
          challengeToken: result.challengeToken,
          pinMode: "verify" as const,
          user: result.user,
          redirectTo: redirectPath,
        } satisfies PendingAuthSession;
        setStoredPendingAuth(nextPendingAuth);
        setPendingAuth(nextPendingAuth);
      } finally {
        pinChallengeBusyRef.current = false;
      }
    }

    if (Date.now() - storedActivityAt >= PIN_RELOCK_IDLE_MS) {
      void requestPinChallenge();
    }
  }, [accessToken, hydrated, pendingAuth, redirectPath, user]);

  useEffect(() => {
    if (!hydrated || !accessToken || !user || pendingAuth) {
      return;
    }

    let lastPersistedAt = getStoredSessionActivityAt() ?? Date.now();
    const persistActivity = () => {
      const now = Date.now();
      if (now - lastPersistedAt < 15_000) {
        return;
      }
      lastPersistedAt = now;
      setStoredSessionActivityAt(now);
    };
    const checkForIdleRelock = async () => {
      const activityAt = getStoredSessionActivityAt();
      if (activityAt == null || Date.now() - activityAt < PIN_RELOCK_IDLE_MS || pinChallengeBusyRef.current) {
        return;
      }

      pinChallengeBusyRef.current = true;
      try {
        const result = await apiPost<{
          challengeToken: string;
          user: UserProfile;
        }>("/api/auth/pin/challenge", {}, accessToken ?? undefined);
        const nextPendingAuth = {
          challengeToken: result.challengeToken,
          pinMode: "verify" as const,
          user: result.user,
          redirectTo: redirectPath,
        } satisfies PendingAuthSession;
        setStoredPendingAuth(nextPendingAuth);
        setPendingAuth(nextPendingAuth);
      } finally {
        pinChallengeBusyRef.current = false;
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void checkForIdleRelock().then(() => {
          if (!pinChallengeBusyRef.current) {
            persistActivity();
          }
        });
      }
    };

    const interval = window.setInterval(() => {
      void checkForIdleRelock();
    }, PIN_RELOCK_CHECK_INTERVAL_MS);

    window.addEventListener("pointerdown", persistActivity, { passive: true });
    window.addEventListener("keydown", persistActivity);
    window.addEventListener("touchstart", persistActivity, { passive: true });
    window.addEventListener("focus", persistActivity);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("pointerdown", persistActivity);
      window.removeEventListener("keydown", persistActivity);
      window.removeEventListener("touchstart", persistActivity);
      window.removeEventListener("focus", persistActivity);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [accessToken, hydrated, pendingAuth, redirectPath, user]);

  function completePendingAuth(result: AuthResult) {
    setStoredToken(result.accessToken);
    setStoredUser(result.user);
    clearStoredPendingAuth();
    setStoredSessionActivityAt();
    setAccessToken(result.accessToken);
    setUser(result.user);
    setPendingAuth(null);
  }

  function logout() {
    clearStoredPendingAuth();
    clearStoredToken();
    clearStoredUser();
    clearStoredSessionActivityAt();
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
