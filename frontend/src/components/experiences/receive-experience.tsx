"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { AppMobileShell } from "@/src/components/layout/app-mobile-shell";
import { ClaimIcon, WalletIcon } from "@/src/components/app-icons";
import { PinGateModal } from "@/src/components/modals/pin-gate-modal";
import { useToast } from "@/src/components/toast-provider";
import { useAuthenticatedSession } from "@/src/lib/use-authenticated-session";

async function shareText(message: string) {
  if (typeof navigator !== "undefined" && navigator.share) {
    await navigator.share({ text: message });
    return "shared";
  }

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(message);
    return "copied";
  }

  throw new Error("Sharing is not available on this device.");
}

export function ReceiveExperience() {
  const { hydrated, user, pendingAuth, completePendingAuth, logout } = useAuthenticatedSession("/app/receive");
  const { showToast } = useToast();
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [sendLink, setSendLink] = useState("");

  useEffect(() => {
    if (typeof window === "undefined" || !user) {
      return;
    }

    const link = new URL("/app/send", window.location.origin);
    link.searchParams.set("phone", user.phoneNumber);
    setSendLink(link.toString());
  }, [user]);

  const shareMessage = useMemo(() => {
    if (!user || !sendLink) {
      return "";
    }

    return [
      `${user.displayName} is ready to receive on TrustLink.`,
      "",
      `TrustLink number: ${user.phoneNumber}`,
      `Handle: @${user.handle}`,
      "",
      `Send with this link: ${sendLink}`,
    ].join("\n");
  }, [sendLink, user]);

  if (!hydrated || !user) {
    return null;
  }

  async function handleShareDetails() {
    setShareBusy(true);
    setError(null);
    setNotice(null);

    try {
      const result = await shareText(shareMessage);
      const nextNotice = result === "shared" ? "Receive details shared." : "Receive details copied.";
      setNotice(nextNotice);
      showToast(nextNotice);
    } catch (shareError) {
      const nextError = shareError instanceof Error ? shareError.message : "Could not share receive details";
      setError(nextError);
      showToast(nextError);
    } finally {
      setShareBusy(false);
    }
  }

  async function handleCopyLink() {
    if (!sendLink || !navigator.clipboard?.writeText) {
      const nextError = "Copy is not available on this device.";
      setError(nextError);
      showToast(nextError);
      return;
    }

    await navigator.clipboard.writeText(sendLink);
    setNotice("Send link copied.");
    setError(null);
    showToast("Send link copied.");
  }

  return (
    <AppMobileShell
      currentTab="receive"
      title="Receive"
      subtitle="Share your TrustLink details like an account number so someone can send to your WhatsApp number quickly."
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

        <section className="rounded-[28px] border border-white/8 bg-pop-bg p-4">
          <div className="mb-3">
            <h2 className="text-lg font-semibold tracking-[-0.04em] text-text">TrustLink receive details</h2>
            <p className="text-sm text-text/48">Share these details so someone can open TrustLink and send straight to your number.</p>
          </div>

          <div className="space-y-3 rounded-[22px] border border-white/6 bg-black/20 px-4 py-4">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-text/46">Display name</span>
              <span className="font-medium text-text">{user.displayName}</span>
            </div>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-text/46">Handle</span>
              <span className="font-medium text-text">@{user.handle}</span>
            </div>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-text/46">TrustLink number</span>
              <span className="font-medium text-text">{user.phoneNumber}</span>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => void handleShareDetails()}
              disabled={shareBusy}
              className="rounded-[20px] bg-[linear-gradient(135deg,#58f2b1,#9fffe4)] px-4 py-3 text-sm font-semibold text-[#04110a] disabled:opacity-50"
            >
              {shareBusy ? "Sharing..." : "Share details"}
            </button>
            <button
              type="button"
              onClick={() => void handleCopyLink()}
              className="rounded-[20px] border border-white/10 bg-black/20 px-4 py-3 text-sm font-medium text-text/78"
            >
              Copy send link
            </button>
          </div>
        </section>

        <section className="rounded-[28px] border border-white/8 bg-pop-bg p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-[-0.04em] text-text">Next actions</h2>
              <p className="text-sm text-text/48">Share your receive identity or jump straight to claim incoming funds.</p>
            </div>
          </div>

          <div className="mt-4 grid gap-3">
            <Link href={`/app/send?phone=${encodeURIComponent(user.phoneNumber)}`} className="inline-flex items-center justify-between rounded-[22px] border border-white/8 bg-black/20 px-4 py-3 text-sm font-medium text-text/78">
              <span>Open send with my number filled in</span>
              <span className="text-text/40">Open</span>
            </Link>
            <Link href="/app/claim" className="inline-flex items-center justify-between rounded-[22px] border border-white/8 bg-black/20 px-4 py-3 text-sm font-medium text-text/78">
              <span className="inline-flex items-center gap-2">
                <ClaimIcon className="h-4 w-4" />
                Claim incoming funds
              </span>
              <span className="text-text/40">Open</span>
            </Link>
            <Link href="/app/wallets" className="inline-flex items-center justify-between rounded-[22px] border border-white/8 bg-black/20 px-4 py-3 text-sm font-medium text-text/78">
              <span className="inline-flex items-center gap-2">
                <WalletIcon className="h-4 w-4" />
                Manage payout wallets
              </span>
              <span className="text-text/40">Open</span>
            </Link>
          </div>
        </section>
      </section>
    </AppMobileShell>
  );
}
