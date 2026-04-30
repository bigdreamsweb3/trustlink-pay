"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getStoredToken, getStoredUser } from "@/src/lib/storage";

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();

  useEffect(() => {
    // Check if user is authenticated
    const token = getStoredToken();
    const user = getStoredUser();

    if (!token || !user) {
      router.replace("/auth");
    }
  }, [router]);

  // If authenticated, render children
  const token = getStoredToken();
  const user = getStoredUser();

  if (!token || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#76ffd8]"></div>
      </div>
    );
  }

  return <>{children}</>;
}
