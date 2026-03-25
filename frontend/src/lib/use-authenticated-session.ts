"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { clearStoredToken, clearStoredUser, getStoredToken, getStoredUser } from "@/src/lib/storage";
import type { UserProfile } from "@/src/lib/types";

export function useAuthenticatedSession(redirectPath: string) {
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);

  useEffect(() => {
    const token = getStoredToken();
    const savedUser = getStoredUser() as UserProfile | null;

    if (!token || !savedUser) {
      router.replace(`/auth?mode=login&redirect=${encodeURIComponent(redirectPath)}`);
      return;
    }

    setAccessToken(token);
    setUser(savedUser);
    setHydrated(true);
  }, [redirectPath, router]);

  function logout() {
    clearStoredToken();
    clearStoredUser();
    router.replace("/auth?mode=login");
  }

  return {
    hydrated,
    accessToken,
    user,
    setUser,
    logout
  };
}
