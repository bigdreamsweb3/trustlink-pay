"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getStoredToken, getStoredUser } from "@/src/lib/storage";

export function HomeRedirect() {
  const router = useRouter();

  useEffect(() => {
    // Check if user is authenticated
    const token = getStoredToken();
    const user = getStoredUser();

    if (token && user) {
      router.replace("/app");
    } else {
      router.replace("/auth");
    }
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#76ffd8]"></div>
    </div>
  );
}
