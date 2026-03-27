"use client";

import { FormEvent, useEffect, useState } from "react";

import { AppMobileShell } from "@/src/components/app-mobile-shell";
import { PinGateModal } from "@/src/components/pin-gate-modal";
import { useToast } from "@/src/components/toast-provider";
import { apiPatch } from "@/src/lib/api";
import { setStoredUser } from "@/src/lib/storage";
import { useAuthenticatedSession } from "@/src/lib/use-authenticated-session";
import type { UserProfile } from "@/src/lib/types";

export function ProfileExperience() {
  const { hydrated, accessToken, user, setUser, pendingAuth, completePendingAuth, logout } = useAuthenticatedSession("/app/profile");
  const { showToast } = useToast();
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    displayName: "",
    handle: ""
  });

  useEffect(() => {
    if (!user) {
      return;
    }

    setForm({
      displayName: user.displayName,
      handle: user.handle
    });
  }, [user]);

  async function handleProfileSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!accessToken) {
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const result = await apiPatch<{ user: UserProfile }>("/api/profile", form, accessToken);
      setUser(result.user);
      setStoredUser(result.user);
      setNotice("Profile updated.");
      showToast("Profile updated.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not update profile");
    } finally {
      setBusy(false);
    }
  }

  if (!hydrated || !user) {
    return null;
  }

  return (
    <AppMobileShell
      currentTab="profile"
      title="Profile"
      subtitle="Keep your sender identity clean and recognizable for every payment you send."
      user={user}
      showBackButton
      backHref="/app"
      blockingOverlay={
        pendingAuth ? (
          <PinGateModal pendingAuth={pendingAuth} user={user} onAuthenticated={completePendingAuth} onSignOut={logout} />
        ) : null
      }
    >
      <section className="space-y-5">
        {notice ? <div className="rounded-[22px] border border-[#58f2b1]/15 bg-[#58f2b1]/8 px-4 py-3 text-sm text-[#7dffd9]">{notice}</div> : null}
        {error ? <div className="rounded-[22px] border border-[#ff7f7f]/20 bg-[#ff7f7f]/8 px-4 py-3 text-sm text-[#ff9e9e]">{error}</div> : null}

        <section className="rounded-[28px] border border-white/8 bg-white/5 p-4">
          <div className="mb-3">
            <h2 className="text-lg font-semibold tracking-[-0.04em] text-white">Identity</h2>
            <p className="text-sm text-white/48">This is the sender identity other people see when funds come from you.</p>
          </div>

          <form className="space-y-4" onSubmit={handleProfileSave}>
            <label className="block">
              <span className="mb-2 block text-sm text-white/56">Display name</span>
              <input
                value={form.displayName}
                onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))}
                placeholder="Daniel Trust"
                className="w-full rounded-[20px] border border-white/8 bg-black/20 px-4 py-3 text-white outline-none transition focus:border-[#58f2b1]/35"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm text-white/56">Handle</span>
              <input
                value={form.handle}
                onChange={(event) => setForm((current) => ({ ...current, handle: event.target.value.toLowerCase() }))}
                placeholder="daniel_trust"
                className="w-full rounded-[20px] border border-white/8 bg-black/20 px-4 py-3 text-white outline-none transition focus:border-[#58f2b1]/35"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-[22px] bg-[linear-gradient(135deg,#58f2b1,#9fffe4)] px-4 py-3 text-sm font-semibold text-[#04110a] shadow-[0_14px_40px_rgba(88,242,177,0.2)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Saving..." : "Save profile"}
            </button>
          </form>
        </section>

        <section className="rounded-[28px] border border-white/8 bg-white/5 p-4">
          <div className="mb-3">
            <h2 className="text-lg font-semibold tracking-[-0.04em] text-white">Wallets and settings</h2>
            <p className="text-sm text-white/48">Wallet connections, payout wallets, currency preferences, and account controls now live in their own pages.</p>
          </div>

          <div className="grid gap-3">
            <a href="/app/wallets" className="rounded-[22px] border border-white/8 bg-black/20 px-4 py-3 text-sm font-medium text-white/78">
              Open Wallets
            </a>
            <a href="/app/settings" className="rounded-[22px] border border-white/8 bg-black/20 px-4 py-3 text-sm font-medium text-white/78">
              Open Settings
            </a>
          </div>
        </section>
      </section>
    </AppMobileShell>
  );
}
