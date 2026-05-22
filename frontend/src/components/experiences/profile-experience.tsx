"use client";

import { FormEvent, useEffect, useState } from "react";
import { ChevronRight, User } from "lucide-react";

import { AppMobileShell } from "@/src/components/layout/app-mobile-shell";
import { PinGateModal } from "@/src/components/modals/pin-gate-modal";
import { useToast } from "@/src/components/toast-provider";
import { apiPatch } from "@/src/lib/api";
import { setStoredUser } from "@/src/lib/storage";
import { useAuthenticatedSession } from "@/src/lib/use-authenticated-session";
import type { UserProfile } from "@/src/lib/types";

function initialsFor(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}

export function ProfileExperience() {
  const { hydrated, accessToken, user, setUser, pendingAuth, completePendingAuth, logout } = useAuthenticatedSession("/app/profile");
  const { showToast } = useToast();
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ displayName: "", handle: "" });

  useEffect(() => { if (!user) return; setForm({ displayName: user.displayName, handle: user.handle }); }, [user]);

  async function handleProfileSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      const result = await apiPatch<{ user: UserProfile }>("/api/profile", form, accessToken);
      setUser(result.user); setStoredUser(result.user);
      setNotice("Profile updated."); showToast("Profile updated.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update profile");
    } finally { setBusy(false); }
  }

  if (!hydrated || !user) return null;

  return (
    <AppMobileShell currentTab="profile" title="Profile" subtitle="Keep your sender identity clean and recognizable for every payment you send." user={user} showBackButton backHref="/app"
      blockingOverlay={pendingAuth ? <PinGateModal pendingAuth={pendingAuth} user={user} onAuthenticated={completePendingAuth} onSignOut={logout} /> : null}
    >
      <section className="space-y-5">

        {/* Notices */}
        {notice ? <div className="tl-badge tl-btn rounded-[18px] px-4 py-3">{notice}</div> : null}
        {error ? <div className="rounded-[18px] border border-[#ff7f7f]/14 bg-[#ff7f7f]/8 px-4 py-3 tl-body-sm text-danger">{error}</div> : null}

        {/* Profile avatar + handle preview */}
        <div className="flex items-center gap-4">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full border border-accent-border bg-[linear-gradient(135deg,var(--accent-soft),rgba(255,255,255,0.08))] tl-h3 text-accent-deep dark:text-accent">
            {initialsFor(form.displayName || user.displayName)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate tl-h3 text-primary">{form.displayName || user.displayName}</div>
            <div className="tl-meta-sm mt-0.5">@{form.handle || user.handle}</div>
          </div>
        </div>

        {/* Identity form */}
        <div>
          <div className="tl-label mb-3">Identity</div>

          <form className="space-y-3" onSubmit={handleProfileSave}>
            <div className="tl-field rounded-[18px] px-4 py-3.5">
              <label className="block">
                <span className="tl-label-sm block">Display name</span>
                <input
                  value={form.displayName}
                  onChange={(e) => setForm((c) => ({ ...c, displayName: e.target.value }))}
                  placeholder="Daniel Trust"
                  className="mt-1.5 block w-full bg-transparent tl-body font-semibold text-primary outline-none placeholder:text-faint"
                />
              </label>
            </div>

            <div className="tl-field rounded-[18px] px-4 py-3.5">
              <label className="block">
                <span className="tl-label-sm block">Handle</span>
                <input
                  value={form.handle}
                  onChange={(e) => setForm((c) => ({ ...c, handle: e.target.value.toLowerCase() }))}
                  placeholder="daniel_trust"
                  className="mt-1.5 block w-full bg-transparent tl-body font-semibold text-primary outline-none placeholder:text-faint"
                />
              </label>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="mt-1 w-full rounded-[18px] bg-[linear-gradient(135deg,#58f2b1,#9fffe4)] px-4 py-3.5 tl-body font-semibold text-[#04110a] shadow-softbox disabled:opacity-50 cursor-pointer active:scale-[0.97] transition-transform"
            >
              {busy ? "Saving..." : "Save profile"}
            </button>
          </form>
        </div>

        {/* Quick links */}
        <div>
          <div className="tl-label mb-3">Quick links</div>
          <div className="space-y-2.5">
            {[
              { href: "/app/activity", label: "Transaction history", desc: "Transfers, claims & receipts" },
              { href: "/app/settings", label: "Settings", desc: "Security, PIN & more" },
            ].map((item) => (
              <a key={item.label} href={item.href} className="tl-field group flex items-center justify-between rounded-[18px] px-4 py-3.5 transition-colors hover:bg-[var(--surface-soft)] cursor-pointer active:scale-[0.99]">
                <div>
                  <span className="block tl-body-sm font-medium">{item.label}</span>
                  <span className="block tl-meta-sm mt-0.5">{item.desc}</span>
                </div>
                <ChevronRight className="h-4 w-4 text-faint transition-transform group-hover:translate-x-0.5" />
              </a>
            ))}
          </div>
        </div>
      </section>
    </AppMobileShell>
  );
}
