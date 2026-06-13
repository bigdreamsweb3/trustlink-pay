"use client";

import { FormEvent, useEffect, useState } from "react";
import { AtSign, Save, UserRound } from "lucide-react";

import { useToast } from "@/src/components/toast-provider";
import { apiPatch } from "@/src/lib/api";
import { setStoredUser } from "@/src/lib/storage";
import type { UserProfile } from "@/src/lib/types";

export function ProfileSection({
  accessToken,
  user,
  setUser,
}: {
  accessToken: string | null;
  user: UserProfile;
  setUser: (user: UserProfile) => void;
}) {
  const { showToast } = useToast();
  const [form, setForm] = useState({
    displayName: user.displayName,
    handle: user.handle,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setForm({ displayName: user.displayName, handle: user.handle });
  }, [user.displayName, user.handle]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken) return;

    setBusy(true);
    setError(null);
    try {
      const result = await apiPatch<{ user: UserProfile }>(
        "/api/profile",
        {
          displayName: form.displayName.trim(),
          handle: form.handle.trim().toLowerCase(),
        },
        accessToken,
      );
      setUser(result.user);
      setStoredUser(result.user);
      showToast("Profile updated.");
    } catch (profileError) {
      const message =
        profileError instanceof Error
          ? profileError.message
          : "Could not update profile";
      setError(message);
      showToast(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="tl-panel rounded-[28px] p-4 sm:p-5">
      <div className="mb-5">
        <h3 className="text-[1rem] font-semibold text-[var(--text)]">
          Public profile
        </h3>
        <p className="mt-1 text-[0.76rem] leading-5 text-[var(--text-soft)]">
          This is the TrustLink name people see in payment activity and
          identity previews. It does not replace a verified TIN legal name.
        </p>
      </div>

      {error ? (
        <div className="mb-4 rounded-[18px] border border-[#ff7f7f]/18 bg-[#ff7f7f]/8 px-4 py-3 text-[0.76rem] text-danger">
          {error}
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-3">
        <label className="tl-field flex items-center gap-3 rounded-[18px] px-4 py-3.5">
          <UserRound className="h-4 w-4 shrink-0 text-accent" />
          <span className="min-w-0 flex-1">
            <span className="block text-[0.62rem] font-medium uppercase tracking-[0.16em] text-[var(--text-faint)]">
              Display name
            </span>
            <input
              value={form.displayName}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  displayName: event.target.value,
                }))
              }
              className="mt-1.5 block w-full bg-transparent text-[0.86rem] font-semibold text-[var(--text)] outline-none"
              placeholder="Your display name"
            />
          </span>
        </label>

        <label className="tl-field flex items-center gap-3 rounded-[18px] px-4 py-3.5">
          <AtSign className="h-4 w-4 shrink-0 text-accent" />
          <span className="min-w-0 flex-1">
            <span className="block text-[0.62rem] font-medium uppercase tracking-[0.16em] text-[var(--text-faint)]">
              TrustLink handle
            </span>
            <input
              value={form.handle}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  handle: event.target.value.replace(/^@/, "").toLowerCase(),
                }))
              }
              className="mt-1.5 block w-full bg-transparent text-[0.86rem] font-semibold text-[var(--text)] outline-none"
              placeholder="trustlink_handle"
            />
          </span>
        </label>

        <button
          type="submit"
          disabled={
            busy ||
            !form.displayName.trim() ||
            !form.handle.trim() ||
            (form.displayName === user.displayName &&
              form.handle === user.handle)
          }
          className="tl-button-primary inline-flex w-full items-center justify-center gap-2 rounded-[18px] px-4 py-3.5 text-[0.82rem] font-semibold disabled:opacity-45"
        >
          <Save className="h-4 w-4" />
          {busy ? "Saving profile..." : "Save profile"}
        </button>
      </form>
    </section>
  );
}
